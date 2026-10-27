-- The match loop: Waiting -> Intermission -> [Countdown -> Live -> RoundEnd -> Draft] x N -> MatchEnd.
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage.Shared
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Progression = require(Shared.Progression)

local ArenaService = require(script.Parent.ArenaService)
local BotService = require(script.Parent.BotService)
local CombatService = require(script.Parent.CombatService)
local DataService = require(script.Parent.DataService)
local DraftService = require(script.Parent.DraftService)
local EventService = require(script.Parent.EventService)
local FighterService = require(script.Parent.FighterService)
local ShopService = require(script.Parent.ShopService)

type Fighter = FighterService.Fighter

local RoundService = {}

local M = Config.Match
local gameState = Net.GameState()
local announceRemote = Net.Event("Announce")
local feedRemote = Net.Event("KillFeed")
local effectRemote = Net.Event("Effect")
local resultsRemote = Net.Event("MatchResults")

local rng = Random.new()
local participants: { Fighter } = {}
local eliminationOrder: { Fighter } = {}
local lastPlacements: { Fighter } = {}

-- Helpers ------------------------------------------------------------------------------

local function setState(name: string, duration: number?, extra: { [string]: any }?)
	gameState:SetAttribute("State", name)
	gameState:SetAttribute("EndsAt", if duration then Workspace:GetServerTimeNow() + duration else 0)
	if extra then
		for key, value in extra do
			gameState:SetAttribute(key, value)
		end
	end
end

local function announce(text: string, style: string, subtitle: string?, target: Player?)
	if target then
		announceRemote:FireClient(target, text, style, subtitle)
	else
		announceRemote:FireAllClients(text, style, subtitle)
	end
end

local function publishScoreboard()
	local rows = {}
	for _, fighter in participants do
		table.insert(rows, {
			Id = fighter.Id,
			Name = fighter.Name,
			Points = fighter.Points,
			KOs = fighter.KOs,
			Alive = fighter.Alive,
			Bot = fighter.IsBot,
			Crown = fighter.Crowned,
		})
	end
	table.sort(rows, function(a, b)
		if a.Points ~= b.Points then
			return a.Points > b.Points
		end
		return a.KOs > b.KOs
	end)
	gameState:SetAttribute("Scoreboard", HttpService:JSONEncode(rows))
end

local function realPlayers(): { Player }
	local list = {}
	for _, player in Players:GetPlayers() do
		if FighterService.GetByPlayer(player) then
			table.insert(list, player)
		end
	end
	return list
end

local function hasRealParticipants(): boolean
	for _, fighter in participants do
		if fighter.Player and fighter.Player.Parent then
			return true
		end
	end
	return false
end

local function anyRealAlive(): boolean
	for _, fighter in participants do
		if fighter.Player and fighter.Alive then
			return true
		end
	end
	return false
end

local function aliveCount(): number
	local count = 0
	for _, fighter in participants do
		if fighter.Alive then
			count += 1
		end
	end
	return count
end

local function sendToLobby(fighter: Fighter)
	fighter.Alive = false
	fighter.Zone = "None"
	FighterService.SetFrozen(fighter, false)
	if fighter.IsBot then
		BotService.DespawnModel(fighter)
	elseif fighter.Player and fighter.Player.Parent then
		local player = fighter.Player
		task.spawn(function()
			local ok, err = pcall(function()
				player:LoadCharacter()
			end)
			if not ok then
				warn("[LaunchParty] LoadCharacter failed:", err)
			end
		end)
	end
end

local function updateCrown()
	local best, bestPoints, tie = nil, 0, false
	for _, fighter in participants do
		if fighter.Points > bestPoints then
			best, bestPoints, tie = fighter, fighter.Points, false
		elseif fighter.Points == bestPoints and bestPoints > 0 then
			tie = true
		end
	end
	for _, fighter in participants do
		fighter.Crowned = (fighter == best and not tie)
		FighterService.RefreshTag(fighter)
	end
end

-- Eliminations -----------------------------------------------------------------------

local function eliminate(fighter: Fighter)
	if not fighter.Alive then
		return
	end
	fighter.Alive = false
	table.insert(eliminationOrder, fighter)
	local position = if fighter.Root then fighter.Root.Position else ArenaService.GetCenter()

	local killer: Fighter? = nil
	local lastHitBy = fighter.LastHitBy
	if lastHitBy and lastHitBy ~= fighter and os.clock() - fighter.LastHitTime <= M.KOCreditWindow then
		if table.find(participants, lastHitBy) then
			killer = lastHitBy
		end
	end
	local bounty = false
	if killer then
		killer.KOs += 1
		killer.Points += M.KOPoints
		if fighter.Crowned then
			killer.Points += M.BountyBonus
			bounty = true
		end
		if killer.Player then
			DataService.AddKO(killer.Player)
		end
	end

	feedRemote:FireAllClients({
		Killer = if killer then killer.Name else nil,
		KillerId = if killer then killer.Id else nil,
		Victim = fighter.Name,
		VictimId = fighter.Id,
		Bounty = bounty,
	})
	effectRemote:FireAllClients("KO", { Position = position, Victim = fighter.Id })
	publishScoreboard()

	task.delay(1.5, function()
		if not fighter.Alive and fighter.Zone == "Arena" then
			sendToLobby(fighter)
		end
	end)
end

local function secondWind(fighter: Fighter)
	fighter.LivesLeft -= 1
	fighter.VoidImmuneUntil = os.clock() + 1.5
	local cframe = ArenaService.GetSafeCFrame()
	FighterService.Teleport(fighter, cframe)
	effectRemote:FireAllClients("SecondWind", { Position = cframe.Position, Fighter = fighter.Id })
	feedRemote:FireAllClients({ Text = string.format("💨 %s got a Second Wind!", fighter.Name) })
	if fighter.Player then
		announce("SECOND WIND!", "Small", "You got one more chance. Don't waste it.", fighter.Player)
	end
end

local function checkEliminations()
	local voidY = ArenaService.GetVoidY()
	local now = os.clock()
	for _, fighter in table.clone(participants) do
		if fighter.Alive then
			if not FighterService.IsAlive(fighter) or fighter.Zone ~= "Arena" then
				eliminate(fighter)
			elseif now > fighter.VoidImmuneUntil and (fighter.Root :: BasePart).Position.Y < voidY then
				if fighter.LivesLeft > 0 then
					secondWind(fighter)
				else
					eliminate(fighter)
				end
			end
		end
	end
end

-- Spawning ----------------------------------------------------------------------------

local function spawnFighter(fighter: Fighter, cframe: CFrame): boolean
	if fighter.IsBot then
		if not BotService.SpawnModel(fighter, cframe) then
			return false
		end
	else
		local player = fighter.Player
		if not player or not player.Parent then
			return false
		end
		if not FighterService.IsAlive(fighter) or fighter.Model ~= player.Character then
			local ok = pcall(function()
				player:LoadCharacter()
			end)
			if not ok then
				return false
			end
			local started = os.clock()
			while
				(fighter.Model ~= player.Character or not FighterService.IsAlive(fighter))
				and os.clock() - started < 6
			do
				task.wait(0.05)
			end
			if not FighterService.IsAlive(fighter) then
				return false
			end
		end
		FighterService.Teleport(fighter, cframe)
	end
	fighter.Zone = "Arena"
	fighter.Alive = true
	FighterService.SetHeat(fighter, 0)
	FighterService.ApplyStats(fighter)
	FighterService.SetFrozen(fighter, true)
	return true
end

local function addLateJoiners()
	for _, player in realPlayers() do
		local fighter = FighterService.GetByPlayer(player)
		if fighter and not fighter.InMatch then
			FighterService.ResetForMatch(fighter)
			fighter.InMatch = true
			table.insert(participants, fighter)
			announce("You're in!", "Small", "You're joining this round.", player)
		end
	end
end

local function setupParticipants()
	table.clear(participants)
	for _, player in realPlayers() do
		local fighter = FighterService.GetByPlayer(player)
		if fighter then
			FighterService.ResetForMatch(fighter)
			fighter.InMatch = true
			table.insert(participants, fighter)
		end
	end
	local botCount = math.clamp(M.MinFighters - #participants, 0, M.MaxBots)
	for _ = 1, botCount do
		local bot = BotService.CreateBot()
		bot.InMatch = true
		table.insert(participants, bot)
	end
end

-- Phases -------------------------------------------------------------------------------

local function waitPhase(seconds: number): boolean
	local ends = os.clock() + seconds
	while os.clock() < ends do
		if #realPlayers() < M.MinRealPlayers then
			return false
		end
		task.wait(0.2)
	end
	return true
end

local function computePlacements(): { Fighter }
	local survivors = {}
	for _, fighter in participants do
		if fighter.Alive then
			table.insert(survivors, fighter)
		end
	end
	-- Time-out ties go to whoever is least cooked.
	table.sort(survivors, function(a, b)
		return a.Heat < b.Heat
	end)
	local placements = survivors
	for i = #eliminationOrder, 1, -1 do
		local fighter = eliminationOrder[i]
		if table.find(participants, fighter) and not table.find(placements, fighter) then
			table.insert(placements, fighter)
		end
	end
	return placements
end

local function runRound(round: number)
	addLateJoiners()
	table.clear(eliminationOrder)

	local shape = if round == 1 then "Disc" else ArenaService.ShapeNames[rng:NextInteger(1, #ArenaService.ShapeNames)]
	local theme = ArenaService.PickTheme(round)
	ArenaService.ApplyTheme(theme)
	ArenaService.Build(shape, theme)
	local event = EventService.Pick(round)
	setState("Countdown", M.CountdownTime + 2, {
		Round = round,
		MaxRounds = M.RoundsPerMatch,
		Event = event.Name,
		EventDesc = event.Description,
		Arena = ArenaService.ShapeTitles[shape] or shape,
		Theme = theme.Name,
		SuddenDeath = false,
	})

	-- Spawn everyone in parallel (LoadCharacter yields).
	local order = table.clone(participants)
	for i = #order, 2, -1 do
		local j = rng:NextInteger(1, i)
		order[i], order[j] = order[j], order[i]
	end
	local spawns = ArenaService.GetSpawnCFrames(#order)
	local pending = #order
	for i, fighter in order do
		FighterService.ResetForRound(fighter)
		task.spawn(function()
			local ok, result = pcall(spawnFighter, fighter, spawns[i])
			if not ok then
				warn("[LaunchParty] Spawn failed:", fighter.Name, result)
			end
			pending -= 1
		end)
	end
	local spawnStarted = os.clock()
	while pending > 0 and os.clock() - spawnStarted < 8 do
		task.wait(0.05)
	end
	publishScoreboard()

	announce(string.format("ROUND %d", round), "Big", event.Name .. ": " .. event.Description)
	task.wait(2)
	for count = M.CountdownTime, 1, -1 do
		announce(tostring(count), "Count")
		task.wait(1)
	end

	for _, fighter in participants do
		if fighter.Alive then
			FighterService.SetFrozen(fighter, false)
		end
	end
	CombatService.SetArenaLive(true)
	EventService.Start(event)
	announce("GO!", "Big")
	setState("Live", M.RoundTime)

	local started = os.clock()
	local lastCrumble = 0
	local suddenDeath = false
	while true do
		task.wait(0.1)
		checkEliminations()
		if aliveCount() <= 1 or not hasRealParticipants() then
			break
		end
		local elapsed = os.clock() - started
		if elapsed >= M.RoundTime then
			break
		end
		local spectatorsOnly = not anyRealAlive()
		if elapsed >= M.SuddenDeathAt or spectatorsOnly then
			if not suddenDeath then
				suddenDeath = true
				gameState:SetAttribute("SuddenDeath", true)
				announce("SUDDEN DEATH", "Event", "The edges are falling apart. Get to the middle!")
			end
			local interval = if spectatorsOnly then M.FastCrumbleInterval else M.CrumbleInterval
			if os.clock() - lastCrumble >= interval then
				lastCrumble = os.clock()
				ArenaService.CrumbleStep()
			end
		end
	end

	CombatService.SetArenaLive(false)
	EventService.Stop()

	local placements = computePlacements()
	for index, fighter in placements do
		fighter.Points += M.PlacementPoints[index] or 0
		fighter.Placement = index
	end
	lastPlacements = placements
	updateCrown()
	publishScoreboard()

	local winner = placements[1]
	setState("RoundEnd", M.RoundEndTime)
	if winner then
		announce(winner.Name .. " wins the round!", "Big", string.format("Round %d of %d done", round, M.RoundsPerMatch))
		effectRemote:FireAllClients("RoundWin", {
			Fighter = winner.Id,
			Position = if winner.Root then winner.Root.Position else nil,
		})
	end

	task.wait(1.5)
	for _, fighter in participants do
		if fighter.Zone == "Arena" then
			sendToLobby(fighter)
		end
	end
	task.wait(M.RoundEndTime - 1.5)
	ArenaService.Clear()
end

local function runDraft()
	setState("Draft", M.DraftTime)
	announce("PICK A PERK", "Big", "If you did badly, your cards are better.")
	local luckBy: { [Fighter]: number } = {}
	local count = #lastPlacements
	for index, fighter in lastPlacements do
		luckBy[fighter] = if count > 1 then (index - 1) / (count - 1) else 0.5
	end
	for _, fighter in participants do
		if luckBy[fighter] == nil then
			luckBy[fighter] = 1 -- late joiners / no-shows get the best odds
		end
	end
	DraftService.Run(participants, luckBy, M.DraftTime)
end

local function finishMatch()
	local ranked = table.clone(participants)
	table.sort(ranked, function(a, b)
		if a.Points ~= b.Points then
			return a.Points > b.Points
		end
		return a.KOs > b.KOs
	end)
	local podium = {}
	for index = 1, math.min(3, #ranked) do
		local fighter = ranked[index]
		table.insert(podium, { Name = fighter.Name, Points = fighter.Points, KOs = fighter.KOs, Bot = fighter.IsBot })
	end
	local champion = ranked[1]
	setState("MatchEnd", M.MatchEndTime, { Champion = if champion then champion.Name else "" })
	if champion then
		announce("👑 " .. champion.Name .. " 👑", "Big", "won the whole match. GG!")
	end

	for index, fighter in ranked do
		local player = fighter.Player
		if player and player.Parent then
			local rewards = DataService.AwardMatch(player, {
				Points = fighter.Points,
				KOs = fighter.KOs,
				Placement = index,
				Won = index == 1,
			})
			resultsRemote:FireClient(player, {
				Podium = podium,
				Placement = index,
				Total = #ranked,
				Points = fighter.Points,
				KOs = fighter.KOs,
				Rewards = rewards,
			})
		end
	end
	task.wait(M.MatchEndTime)
end

local function cleanupMatch()
	CombatService.SetArenaLive(false)
	EventService.Stop()
	for _, fighter in participants do
		if fighter.IsBot then
			BotService.Remove(fighter)
		else
			fighter.InMatch = false
			FighterService.ResetForMatch(fighter)
			if fighter.Zone == "Arena" then
				sendToLobby(fighter)
			end
		end
	end
	table.clear(participants)
	table.clear(eliminationOrder)
	table.clear(lastPlacements)
	ArenaService.Clear()
	ArenaService.ApplyTheme(ArenaService.Themes[1])
	publishScoreboard()
end

local function runMatch()
	setState("Waiting", nil, { Round = 0, Event = "", EventDesc = "", SuddenDeath = false })
	while #realPlayers() < M.MinRealPlayers do
		task.wait(1)
	end

	setState("Intermission", M.FirstIntermission, { Round = 0, MaxRounds = M.RoundsPerMatch })
	if not waitPhase(M.FirstIntermission) then
		return
	end

	setupParticipants()
	for round = 1, M.RoundsPerMatch do
		if not hasRealParticipants() then
			break
		end
		runRound(round)
		if round < M.RoundsPerMatch and hasRealParticipants() then
			runDraft()
		end
	end
	if hasRealParticipants() then
		finishMatch()
	end
end

-- Players ------------------------------------------------------------------------------

local function syncProgression(fighter: Fighter)
	local player = fighter.Player
	if not player then
		return
	end
	local level = player:GetAttribute("Level") or 1
	local tier, title = Progression.TitleFor(level)
	fighter.Level = level
	fighter.TrailTier = tier
	fighter.TitleName = title
	FighterService.RefreshCosmetics(fighter)
end

local function onCharacter(fighter: Fighter, character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10)
	local root = character:WaitForChild("HumanoidRootPart", 10)
	local player = fighter.Player
	if not humanoid or not root or not player or player.Character ~= character then
		return
	end
	if fighter.Alive then
		-- Character was replaced mid-round (reset, etc.): that's an elimination, KO credit included.
		eliminate(fighter)
	end
	FighterService.BindModel(fighter, character)
	fighter.Zone = "Lobby"
	ShopService.ApplyCosmetics(fighter)
end

local function onPlayerAdded(player: Player)
	local fighter = FighterService.New("P" .. player.UserId, player.DisplayName, { Player = player })
	player:GetAttributeChangedSignal("Level"):Connect(function()
		syncProgression(fighter)
	end)
	player.CharacterAdded:Connect(function(character)
		onCharacter(fighter, character)
	end)
	if player.Character then
		task.spawn(onCharacter, fighter, player.Character)
	end
	task.spawn(DataService.Load, player)
end

local function onPlayerRemoving(player: Player)
	local fighter = FighterService.GetByPlayer(player)
	if not fighter then
		return
	end
	if fighter.Alive then
		eliminate(fighter)
	end
	local index = table.find(participants, fighter)
	if index then
		table.remove(participants, index)
	end
	FighterService.Remove(fighter)
	publishScoreboard()
end

-- Lobby safety net: anyone who escapes or falls out of the lobby gets respawned.
local function lobbyWatch()
	while true do
		task.wait(0.5)
		local lobbyVoid = ArenaService.GetLobbyVoidY()
		for _, fighter in FighterService.All() do
			if fighter.Player and fighter.Zone == "Lobby" and FighterService.IsAlive(fighter) then
				if (fighter.Root :: BasePart).Position.Y < lobbyVoid then
					FighterService.Teleport(fighter, ArenaService.GetLobbySpawnCFrame())
				end
			end
		end
	end
end

function RoundService.Init()
	Players.RespawnTime = 2
	Players.PlayerAdded:Connect(onPlayerAdded)
	Players.PlayerRemoving:Connect(onPlayerRemoving)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end
	task.spawn(lobbyWatch)
	publishScoreboard()
end

function RoundService.Start()
	task.spawn(function()
		while true do
			local ok, err = pcall(runMatch)
			if not ok then
				warn("[LaunchParty] Match loop error:", err)
			end
			local cleaned, cleanupErr = pcall(cleanupMatch)
			if not cleaned then
				warn("[LaunchParty] Cleanup error:", cleanupErr)
			end
			task.wait(if ok then 1 else 3)
		end
	end)
end

return RoundService
