-- Persistent profiles (XP, wins, KOs) with retries, autosave and a safe offline fallback.
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage.Shared
local Perks = require(Shared.Perks)
local Progression = require(Shared.Progression)

local DataService = {}

local STORE_NAME = "LaunchParty_Profiles_v1"
local AUTOSAVE_INTERVAL = 120
local RETRIES = if RunService:IsStudio() then 1 else 3

type Profile = { Data: { [string]: any }, Persistent: boolean, Dirty: boolean }

local profiles: { [Player]: Profile } = {}
local loadedEvent = Instance.new("BindableEvent")
DataService.ProfileLoaded = loadedEvent.Event

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
		Version = 1,
		XP = 0,
		Wins = 0,
		KOs = 0,
		Matches = 0,
		LastDailyWin = "",
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
	createLeaderstats(player)
	publish(player)
	loadedEvent:Fire(player)
end

function DataService.Save(player: Player)
	local profile = profiles[player]
	if not profile or not profile.Persistent or not store or not profile.Dirty then
		return
	end
	local snapshot = table.clone(profile.Data)
	local ok = withRetries("Save " .. player.Name, function()
		(store :: DataStore):UpdateAsync(keyFor(player), function()
			return snapshot
		end)
	end)
	if ok then
		profile.Dirty = false
	end
end

function DataService.IsLoaded(player: Player): boolean
	return profiles[player] ~= nil
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
		profile.Dirty = true
		publish(player)
	end
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
	local oldLevel = Progression.FromXP(data.XP)
	data.XP += xp
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
			table.insert(unlocks, "New title & trail: " .. entry.Name)
		end
	end

	profile.Dirty = true
	publish(player)
	return {
		XP = xp,
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
