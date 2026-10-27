-- Bots keep matches lively when the server is quiet, and dummies give the lobby something to punch.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage.Shared
local Config = require(Shared.Config)

local ArenaService = require(script.Parent.ArenaService)
local CombatService = require(script.Parent.CombatService)
local FighterService = require(script.Parent.FighterService)

type Fighter = FighterService.Fighter

local BotService = {}

local BOT_NAMES = {
	"Gary", "Bonkers", "Sir Yeetsalot", "Noodle", "Captain Wobble", "Meatball", "Turbo Toast",
	"Lil' Launch", "Big Steve", "Pudding", "Chonk", "Wiggles", "Doomba", "Mr. Bounce", "Kevin",
}

local PALETTES = {
	{ Color3.fromRGB(255, 120, 90), Color3.fromRGB(60, 70, 160) },
	{ Color3.fromRGB(90, 200, 255), Color3.fromRGB(40, 40, 60) },
	{ Color3.fromRGB(255, 210, 70), Color3.fromRGB(200, 60, 60) },
	{ Color3.fromRGB(150, 255, 120), Color3.fromRGB(70, 50, 120) },
	{ Color3.fromRGB(230, 120, 255), Color3.fromRGB(30, 120, 90) },
	{ Color3.fromRGB(255, 255, 255), Color3.fromRGB(255, 90, 160) },
}
local SKIN = Color3.fromRGB(255, 214, 170)

local rng = Random.new()
local nextBotId = 0
local bots: { Fighter } = {}
local fighterFolder: Folder? = nil

local function getFolder(): Folder
	if fighterFolder and fighterFolder.Parent then
		return fighterFolder
	end
	local folder = Instance.new("Folder")
	folder.Name = "Bots"
	folder.Parent = Workspace
	fighterFolder = folder
	return folder
end

local function pickName(): string
	local used = {}
	for _, bot in bots do
		used[bot.Name] = true
	end
	local options = {}
	for _, name in BOT_NAMES do
		if not used[name] then
			table.insert(options, name)
		end
	end
	if #options == 0 then
		return "Bot " .. tostring(nextBotId)
	end
	return options[rng:NextInteger(1, #options)]
end

-- A minimal rig in case avatar loading fails (e.g. offline Studio). Not pretty, but playable.
local function buildFallbackRig(shirt: Color3, pants: Color3): Model
	local model = Instance.new("Model")
	local function piece(name: string, size: Vector3, offset: Vector3, color: Color3, transparency: number?): Part
		local part = Instance.new("Part")
		part.Name = name
		part.Size = size
		part.Color = color
		part.Transparency = transparency or 0
		part.TopSurface = Enum.SurfaceType.Smooth
		part.BottomSurface = Enum.SurfaceType.Smooth
		part.CFrame = CFrame.new(offset)
		part.Parent = model
		return part
	end
	local root = piece("HumanoidRootPart", Vector3.new(2, 2, 1), Vector3.new(0, 0, 0), shirt, 1)
	local parts = {
		piece("UpperTorso", Vector3.new(2, 2, 1), Vector3.new(0, 0, 0), shirt),
		piece("Head", Vector3.new(1.2, 1.2, 1.2), Vector3.new(0, 1.6, 0), SKIN),
		piece("LeftLeg", Vector3.new(0.9, 2, 1), Vector3.new(-0.5, -2, 0), pants),
		piece("RightLeg", Vector3.new(0.9, 2, 1), Vector3.new(0.5, -2, 0), pants),
		piece("LeftArm", Vector3.new(0.8, 2, 0.8), Vector3.new(-1.4, 0, 0), SKIN),
		piece("RightArm", Vector3.new(0.8, 2, 0.8), Vector3.new(1.4, 0, 0), SKIN),
	}
	for _, part in parts do
		part.CanCollide = part.Name == "UpperTorso" or part.Name == "Head"
		part.Massless = true
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = root
		weld.Part1 = part
		weld.Parent = part
	end
	local humanoid = Instance.new("Humanoid")
	humanoid.RigType = Enum.HumanoidRigType.R15
	humanoid.HipHeight = 2
	humanoid.Parent = model
	model.PrimaryPart = root
	return model
end

local function buildRig(shirt: Color3, pants: Color3): Model
	local description = Instance.new("HumanoidDescription")
	description.HeadColor = SKIN
	description.LeftArmColor = SKIN
	description.RightArmColor = SKIN
	description.TorsoColor = shirt
	description.LeftLegColor = pants
	description.RightLegColor = pants

	local ok, result = pcall(function()
		return Players:CreateHumanoidModelFromDescription(description, Enum.HumanoidRigType.R15)
	end)
	if ok and result then
		for _, child in result:GetDescendants() do
			if child:IsA("BaseScript") then
				child:Destroy()
			end
		end
		return result
	end
	warn("[LaunchParty] Avatar rig failed, using fallback rig:", result)
	return buildFallbackRig(shirt, pants)
end

local function setupAnimations(fighter: Fighter)
	local humanoid = fighter.Humanoid :: Humanoid
	local animator = humanoid:FindFirstChildOfClass("Animator")
	if not animator then
		local created = Instance.new("Animator")
		created.Parent = humanoid
		animator = created
	end

	local tracks: { [string]: AnimationTrack } = {}
	for key, id in Config.Anims do
		local animation = Instance.new("Animation")
		animation.AnimationId = id
		local ok, track = pcall(function()
			return (animator :: Animator):LoadAnimation(animation)
		end)
		if ok and track then
			tracks[key] = track
		end
	end
	if tracks.Idle then
		tracks.Idle.Looped = true
		tracks.Idle.Priority = Enum.AnimationPriority.Idle
		tracks.Idle:Play()
	end
	if tracks.Walk then
		tracks.Walk.Looped = true
		tracks.Walk.Priority = Enum.AnimationPriority.Movement
	end
	fighter.Brain = fighter.Brain or {}
	fighter.Brain.Tracks = tracks
end

-- Lifecycle ------------------------------------------------------------------------

function BotService.CreateBot(): Fighter
	nextBotId += 1
	local fighter = FighterService.New("B" .. nextBotId, pickName(), { IsBot = true })
	local palette = PALETTES[rng:NextInteger(1, #PALETTES)]
	fighter.Brain = {
		Shirt = palette[1],
		Pants = palette[2],
		Skill = rng:NextNumber(0.35, 0.85),
		Target = nil,
		NextRetarget = 0,
		NextAttack = 0,
		ChargeRelease = nil,
		Tracks = {},
	}
	table.insert(bots, fighter)
	return fighter
end

function BotService.SpawnModel(fighter: Fighter, cframe: CFrame): boolean
	BotService.DespawnModel(fighter)
	local brain = fighter.Brain
	local model = buildRig(brain.Shirt, brain.Pants)
	model.Name = fighter.Name
	model:PivotTo(cframe)
	model.Parent = getFolder()

	if not FighterService.BindModel(fighter, model) then
		model:Destroy()
		return false
	end
	local root = fighter.Root :: BasePart
	pcall(function()
		root:SetNetworkOwner(nil)
	end)
	setupAnimations(fighter)
	return true
end

function BotService.DespawnModel(fighter: Fighter)
	local model = fighter.Model
	FighterService.UnbindModel(fighter)
	if model then
		model:Destroy()
	end
end

function BotService.Remove(fighter: Fighter)
	BotService.DespawnModel(fighter)
	FighterService.Remove(fighter)
	local index = table.find(bots, fighter)
	if index then
		table.remove(bots, index)
	end
end

function BotService.CreateDummy(home: CFrame): Fighter
	nextBotId += 1
	local fighter = FighterService.New("D" .. nextBotId, "Practice Dummy", { IsBot = true, IsDummy = true })
	fighter.Brain = { Shirt = Color3.fromRGB(230, 170, 90), Pants = Color3.fromRGB(150, 100, 60), Skill = 0, Tracks = {} }
	fighter.Home = home
	fighter.Zone = "Lobby"
	BotService.SpawnModel(fighter, home)
	table.insert(bots, fighter)
	return fighter
end

-- AI -------------------------------------------------------------------------------

local function flat(vector: Vector3): Vector3
	return Vector3.new(vector.X, 0, vector.Z)
end

local function safeUnit(vector: Vector3, fallback: Vector3): Vector3
	if vector.Magnitude > 0.05 then
		return vector.Unit
	end
	return fallback
end

local function chooseTarget(fighter: Fighter, candidates: { Fighter }): Fighter?
	local root = fighter.Root :: BasePart
	local best, bestScore = nil, math.huge
	for _, other in candidates do
		if other ~= fighter then
			local distance = flat((other.Root :: BasePart).Position - root.Position).Magnitude
			-- Prefer close, high-heat targets, and gang up on the crowned leader.
			local score = distance - other.Heat * 0.1 - (if other.Crowned then 12 else 0)
			if score < bestScore then
				best, bestScore = other, score
			end
		end
	end
	return best
end

local function updateWalkAnimation(fighter: Fighter)
	local tracks = fighter.Brain and fighter.Brain.Tracks
	local walk = tracks and tracks.Walk
	if not walk then
		return
	end
	local humanoid = fighter.Humanoid :: Humanoid
	local speed = flat((fighter.Root :: BasePart).AssemblyLinearVelocity).Magnitude
	local moving = speed > 1.5 and not humanoid.PlatformStand
	if moving and not walk.IsPlaying then
		walk:Play(0.15)
	elseif not moving and walk.IsPlaying then
		walk:Stop(0.2)
	end
	if moving then
		walk:AdjustSpeed(math.clamp(speed / 14, 0.6, 1.8))
	end
end

local function thinkDummy(fighter: Fighter, now: number)
	local home = fighter.Home :: CFrame
	if not FighterService.IsAlive(fighter) then
		BotService.SpawnModel(fighter, home)
		return
	end
	local root = fighter.Root :: BasePart
	local away = (root.Position - home.Position).Magnitude
	local idle = now - fighter.LastHitTime > 4 and now > fighter.TumbleUntil
	if root.Position.Y < ArenaService.GetLobbyVoidY() or away > 40 or (idle and away > 3) then
		FighterService.Teleport(fighter, home)
	end
end

local function dashReady(fighter: Fighter, now: number): boolean
	for _, readyAt in fighter.DashReady do
		if readyAt <= now then
			return true
		end
	end
	return false
end

-- Dash only if there's floor where we'd land (bots shouldn't dash themselves off the map).
local function safeDash(fighter: Fighter, direction: Vector3): boolean
	local root = fighter.Root :: BasePart
	if not ArenaService.IsOverArena(root.Position + direction * 14) then
		return false
	end
	return CombatService.TryDash(fighter, direction)
end

local function think(fighter: Fighter, now: number)
	local humanoid = fighter.Humanoid :: Humanoid
	local root = fighter.Root :: BasePart
	local brain = fighter.Brain
	local skill = brain.Skill
	local center = ArenaService.GetCenter()
	local position = root.Position
	local toCenter = safeUnit(flat(center - position), Vector3.new(0, 0, 1))
	local overArena = ArenaService.IsOverArena(position)
	local canDash = dashReady(fighter, now)

	-- Recovery: launched off the edge? Air-dash back toward the middle.
	if not overArena and position.Y < center.Y + 1 then
		if canDash and rng:NextNumber() < 0.45 + skill * 0.5 then
			CombatService.TryDash(fighter, toCenter)
		end
		humanoid:Move(toCenter, false)
		return
	end
	if now < fighter.TumbleUntil or humanoid.PlatformStand then
		return
	end

	if now >= brain.NextRetarget or not brain.Target or not brain.Target.Alive then
		brain.Target = chooseTarget(fighter, FighterService.AliveInArena())
		brain.NextRetarget = now + rng:NextNumber(0.8, 1.6)
	end
	local target: Fighter? = brain.Target
	if not target or not FighterService.IsAlive(target) then
		humanoid:Move(toCenter * 0.5, false)
		return
	end

	local offset = flat((target.Root :: BasePart).Position - position)
	local distance = offset.Magnitude
	local aim = safeUnit(offset, root.CFrame.LookVector)
	-- Imperfect aim so bots feel human.
	local wobble = (1 - skill) * 0.35
	aim = safeUnit(aim + Vector3.new(rng:NextNumber(-wobble, wobble), 0, rng:NextNumber(-wobble, wobble)), aim)

	-- Edge avoidance: never walk somewhere with no floor.
	local moveDir = aim
	local nearEdge = not ArenaService.IsOverArena(position + moveDir * 5)
	if nearEdge then
		moveDir = toCenter
	end

	if canDash and now >= (brain.NextDash or 0) then
		local dashed = false
		if target.ChargeStart and distance < 10 and rng:NextNumber() < 0.15 + skill * 0.35 then
			-- Someone's winding up a big punch nearby: sidestep it.
			local side = Vector3.new(-aim.Z, 0, aim.X) * (if rng:NextNumber() < 0.5 then 1 else -1)
			dashed = safeDash(fighter, side) or safeDash(fighter, -side)
		elseif nearEdge and distance < 8 and rng:NextNumber() < 0.2 + skill * 0.3 then
			-- Cornered at the edge: dash back toward the middle.
			dashed = safeDash(fighter, toCenter)
		elseif distance > 7 and distance < 20 and rng:NextNumber() < 0.12 + skill * 0.18 then
			-- Close the gap and bump them.
			dashed = safeDash(fighter, aim)
		end
		if dashed then
			brain.NextDash = now + rng:NextNumber(0.6, 1.4)
			return
		end
	end

	if brain.ChargeRelease then
		humanoid:Move(moveDir * 0.6, false)
		if now >= brain.ChargeRelease or (distance <= Config.Combat.PunchRange and now >= brain.ChargeRelease - 0.3) then
			root.CFrame = CFrame.lookAt(position, position + aim)
			CombatService.ReleasePunch(fighter, aim)
			brain.ChargeRelease = nil
			brain.NextAttack = now + rng:NextNumber(0.3, 0.7)
		end
		return
	end

	if distance <= Config.Combat.PunchRange * 0.9 then
		humanoid:Move(moveDir * 0.3, false)
		local cooldown = Config.Combat.PunchCooldown * fighter.Stats.PunchCooldownMult
		if now >= brain.NextAttack and now - fighter.LastPunch >= cooldown then
			root.CFrame = CFrame.lookAt(position, position + aim)
			if target.Heat > 55 and rng:NextNumber() < 0.35 + skill * 0.3 then
				if CombatService.BeginCharge(fighter) then
					brain.ChargeRelease = now + rng:NextNumber(0.45, 0.95)
				end
			else
				CombatService.ReleasePunch(fighter, aim)
			end
			brain.NextAttack = now + rng:NextNumber(0.12, 0.5) * (1.4 - skill)
		end
	else
		humanoid:Move(moveDir, false)
	end

	if rng:NextNumber() < 0.012 then
		humanoid.Jump = true
	end
end

function BotService.Init()
	task.spawn(function()
		while true do
			task.wait(0.1)
			local now = os.clock()
			for _, fighter in table.clone(bots) do
				local ok, err = pcall(function()
					if fighter.IsDummy then
						thinkDummy(fighter, now)
					elseif fighter.Alive and fighter.Zone == "Arena" and FighterService.IsAlive(fighter) then
						if CombatService.IsArenaLive() and not fighter.Frozen then
							think(fighter, now)
						else
							(fighter.Humanoid :: Humanoid):Move(Vector3.zero, false)
						end
					end
					if FighterService.IsAlive(fighter) then
						updateWalkAnimation(fighter)
					end
				end)
				if not ok then
					warn("[LaunchParty] Bot error:", fighter.Name, err)
				end
			end
		end
	end)
end

-- Lets events (e.g. the Sweeper) nudge bots into jumping.
function BotService.GetSkill(fighter: Fighter): number
	return if fighter.Brain and fighter.Brain.Skill then fighter.Brain.Skill else 0
end

return BotService
