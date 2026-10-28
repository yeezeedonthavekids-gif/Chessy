-- Saved player profiles: XP, stats, Bonks, owned cosmetics, purchases.
-- Retries on failure, autosaves, saves on shutdown, and never overwrites data it failed to load.
local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage.Shared
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Perks = require(Shared.Perks)
local Progression = require(Shared.Progression)
local Shop = require(Shared.Shop)

local DataService = {}

local STORE_NAME = "LaunchParty_Profiles_v1"
local AUTOSAVE_INTERVAL = 120
local RETRIES = if RunService:IsStudio() then 1 else 3
local MAX_RECEIPTS = 100

type Profile = { Data: { [string]: any }, Persistent: boolean, Dirty: boolean }

local profiles: { [Player]: Profile } = {}
local loadedEvent = Instance.new("BindableEvent")
DataService.ProfileLoaded = loadedEvent.Event
local changedEvent = Instance.new("BindableEvent")
DataService.ProfileChanged = changedEvent.Event

local store: DataStore? = nil
do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(STORE_NAME)
	end)
	if ok then
		store = result
	else
		warn("[LaunchParty] DataStores unavailable, progress will not save this session:", result)
	end
end

local function defaultData(): { [string]: any }
	return {
		Version = 2,
		XP = 0,
		Wins = 0,
		KOs = 0,
		Matches = 0,
		LastDailyWin = "",
		Bonks = 0,
		OwnedSkins = { classic = true },
		OwnedTrails = { level = true },
		EquippedSkin = "classic",
		EquippedTrail = "level",
		Bundles = {},
		Receipts = {},
		TutorialDone = false,
		QuestDay = 0,
		Quests = {},
		FirstJoin = 0,
	}
end

local function reconcile(data: any): { [string]: any }
	if type(data) ~= "table" then
		return defaultData()
	end
	for key, value in defaultData() do
		if type(data[key]) ~= type(value) then
			data[key] = value
		end
	end
	data.OwnedSkins.classic = true
	data.OwnedTrails.level = true
	return data
end

local function withRetries(label: string, callback: () -> any): (boolean, any)
	local lastError = nil
	for attempt = 1, RETRIES do
		local ok, result = pcall(callback)
		if ok then
			return true, result
		end
		lastError = result
		if attempt < RETRIES then
			task.wait(2 ^ attempt)
		end
	end
	warn(string.format("[LaunchParty] %s failed: %s", label, tostring(lastError)))
	return false, lastError
end

local function keyFor(player: Player): string
	return "u_" .. player.UserId
end

local function keys(map: { [string]: any }): { string }
	local list = {}
	for key, value in map do
		if value then
			table.insert(list, key)
		end
	end
	return list
end

local function publish(player: Player)
	local profile = profiles[player]
	if not profile then
		return
	end
	local data = profile.Data
	local level, into, needed = Progression.FromXP(data.XP)
	local tier, title = Progression.TitleFor(level)

	player:SetAttribute("Level", level)
	player:SetAttribute("XPInto", into)
	player:SetAttribute("XPNeeded", needed)
	player:SetAttribute("Title", title)
	player:SetAttribute("TitleTier", tier)
	player:SetAttribute("DataPersistent", profile.Persistent)
	player:SetAttribute("Bonks", data.Bonks)
	player:SetAttribute("EquippedSkin", data.EquippedSkin)
	player:SetAttribute("EquippedTrail", data.EquippedTrail)
	player:SetAttribute("TutorialDone", data.TutorialDone)
	player:SetAttribute("StarterOfferEndsAt", DataService.StarterOfferEndsAt(player))
	player:SetAttribute(
		"Inventory",
		HttpService:JSONEncode({
			Skins = keys(data.OwnedSkins),
			Trails = keys(data.OwnedTrails),
			Bundles = keys(data.Bundles),
		})
	)

	local leaderstats = player:FindFirstChild("leaderstats")
	if leaderstats then
		local values = { Level = level, Wins = data.Wins, KOs = data.KOs }
		for name, value in values do
			local stat = leaderstats:FindFirstChild(name)
			if stat and stat:IsA("IntValue") then
				stat.Value = value
			end
		end
	end
	changedEvent:Fire(player)
end

local function createLeaderstats(player: Player)
	if player:FindFirstChild("leaderstats") then
		return
	end
	local folder = Instance.new("Folder")
	folder.Name = "leaderstats"
	for _, name in { "Level", "Wins", "KOs" } do
		local value = Instance.new("IntValue")
		value.Name = name
		value.Parent = folder
	end
	folder.Parent = player
end

function DataService.Load(player: Player)
	local data = nil
	local persistent = false
	if store then
		local ok, result = withRetries("Load " .. player.Name, function()
			return (store :: DataStore):GetAsync(keyFor(player))
		end)
		if ok then
			data = result
			persistent = true
		end
	end
	if not player.Parent then
		return
	end
	profiles[player] = { Data = reconcile(data), Persistent = persistent, Dirty = false }
	if profiles[player].Data.FirstJoin == 0 then
		profiles[player].Data.FirstJoin = os.time()
		profiles[player].Dirty = true
	end
	createLeaderstats(player)
	publish(player)
	loadedEvent:Fire(player)
end

local function write(player: Player, profile: Profile): boolean
	local snapshot = table.clone(profile.Data)
	local ok = withRetries("Save " .. player.Name, function()
		(store :: DataStore):UpdateAsync(keyFor(player), function()
			return snapshot
		end)
	end)
	if ok then
		profile.Dirty = false
	end
	return ok
end

function DataService.Save(player: Player)
	local profile = profiles[player]
	if not profile or not profile.Persistent or not store or not profile.Dirty then
		return
	end
	write(player, profile)
end

-- Saves right now. Returns true if the data is safe (or this session doesn't save at all).
function DataService.SaveNow(player: Player): boolean
	local profile = profiles[player]
	if not profile then
		return false
	end
	if not profile.Persistent or not store then
		return true
	end
	return write(player, profile)
end

-- Unix time the Starter Bundle offer ends, or 0 if it's gone (bought or expired).
function DataService.StarterOfferEndsAt(player: Player): number
	local profile = profiles[player]
	if not profile then
		return 0
	end
	local data = profile.Data
	local endsAt = data.FirstJoin + Shop.StarterOfferHours * 3600
	if data.Bundles.StarterBundle or os.time() >= endsAt then
		return 0
	end
	return endsAt
end

function DataService.IsLoaded(player: Player): boolean
	return profiles[player] ~= nil
end

-- Direct access for services that edit inventory. Call MarkDirty afterwards.
function DataService.GetData(player: Player): { [string]: any }?
	local profile = profiles[player]
	return if profile then profile.Data else nil
end

function DataService.MarkDirty(player: Player)
	local profile = profiles[player]
	if profile then
		profile.Dirty = true
		publish(player)
	end
end

function DataService.GetLevel(player: Player): number
	local profile = profiles[player]
	if not profile then
		return 1
	end
	return (Progression.FromXP(profile.Data.XP))
end

function DataService.AddKO(player: Player)
	local profile = profiles[player]
	if profile then
		profile.Data.KOs += 1
		DataService.MarkDirty(player)
	end
end

function DataService.AddBonks(player: Player, amount: number)
	local profile = profiles[player]
	if profile then
		profile.Data.Bonks = math.max(0, profile.Data.Bonks + math.floor(amount))
		DataService.MarkDirty(player)
	end
end

function DataService.HasReceipt(player: Player, purchaseId: string): boolean
	local profile = profiles[player]
	return profile ~= nil and table.find(profile.Data.Receipts, purchaseId) ~= nil
end

function DataService.AddReceipt(player: Player, purchaseId: string)
	local profile = profiles[player]
	if not profile then
		return
	end
	local receipts = profile.Data.Receipts
	table.insert(receipts, purchaseId)
	while #receipts > MAX_RECEIPTS do
		table.remove(receipts, 1)
	end
	DataService.MarkDirty(player)
end

export type MatchInput = { Points: number, KOs: number, Placement: number, Won: boolean }

function DataService.AwardMatch(player: Player, result: MatchInput): { [string]: any }?
	local profile = profiles[player]
	if not profile then
		return nil
	end
	local data = profile.Data
	local today = os.date("!%Y-%m-%d")
	local daily = result.Won and data.LastDailyWin ~= today

	local xp, breakdown = Progression.MatchXP({
		Points = result.Points,
		KOs = result.KOs,
		Placement = result.Placement,
		Won = result.Won,
		DailyBonus = daily,
	})
	if player:GetAttribute("Pass_DoubleXP") then
		xp *= 2
		table.insert(breakdown, "2x XP pass, doubled")
	end

	local economy = Config.Economy
	local bonks = economy.MatchBonks
		+ result.Points * economy.BonksPerPoint
		+ result.KOs * economy.BonksPerKO
		+ (if result.Won then economy.WinBonks else 0)
	if player:GetAttribute("Pass_VIP") then
		bonks *= 2
	end

	local oldLevel = Progression.FromXP(data.XP)
	data.XP += xp
	data.Bonks += bonks
	data.Matches += 1
	if result.Won then
		data.Wins += 1
	end
	if daily then
		data.LastDailyWin = today
	end
	local newLevel, into, needed = Progression.FromXP(data.XP)

	local unlocks = {}
	for _, def in Perks.List do
		if def.UnlockLevel > oldLevel and def.UnlockLevel <= newLevel then
			table.insert(unlocks, "New perk: " .. def.Name)
		end
	end
	for _, entry in Progression.Titles do
		if entry.Level > oldLevel and entry.Level <= newLevel then
			table.insert(unlocks, "New title and trail color: " .. entry.Name)
		end
	end

	DataService.MarkDirty(player)
	return {
		XP = xp,
		Bonks = bonks,
		Breakdown = breakdown,
		OldLevel = oldLevel,
		NewLevel = newLevel,
		XPInto = into,
		XPNeeded = needed,
		Unlocks = unlocks,
		Daily = daily,
		Persistent = profile.Persistent,
	}
end

function DataService.Init()
	local resultRemote = Net.Event("ShopResult")
	Net.Event("TutorialDone").OnServerEvent:Connect(function(player)
		local profile = profiles[player]
		if not profile or profile.Data.TutorialDone then
			return
		end
		profile.Data.TutorialDone = true
		profile.Data.Bonks += Config.Economy.TutorialBonks
		DataService.MarkDirty(player)
		resultRemote:FireClient(player, true, string.format("Tutorial done! Here's %d Bonks.", Config.Economy.TutorialBonks))
	end)

	Players.PlayerRemoving:Connect(function(player)
		DataService.Save(player)
		profiles[player] = nil
	end)

	task.spawn(function()
		while true do
			task.wait(AUTOSAVE_INTERVAL)
			for player in profiles do
				task.spawn(DataService.Save, player)
			end
		end
	end)

	game:BindToClose(function()
		local pending = 0
		for player in profiles do
			pending += 1
			task.spawn(function()
				DataService.Save(player)
				pending -= 1
			end)
		end
		local started = os.clock()
		while pending > 0 and os.clock() - started < 25 do
			task.wait(0.1)
		end
	end)
end

return DataService
