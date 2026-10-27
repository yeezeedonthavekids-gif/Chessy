-- Daily quests: tracks progress, pays out Bonks when one's done, resets every day.
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Net = require(Shared.Net)
local Quests = require(Shared.Quests)

local CombatService = require(script.Parent.CombatService)
local DataService = require(script.Parent.DataService)

local QuestService = {}

local resultRemote = Net.Event("ShopResult")

-- Makes sure the player has today's quests. Returns their data, or nil if not loaded yet.
local function ensureToday(player: Player): { [string]: any }?
	local data = DataService.GetData(player)
	if not data then
		return nil
	end
	local day = Quests.DayNumber(os.time())
	if data.QuestDay ~= day then
		data.QuestDay = day
		data.Quests = {}
		for _, id in Quests.PickDaily(day, player.UserId, Quests.PerDay) do
			table.insert(data.Quests, { Id = id, Progress = 0, Done = false })
		end
		DataService.MarkDirty(player)
	end
	return data
end

local function publish(player: Player)
	local data = ensureToday(player)
	if not data then
		return
	end
	local list = {}
	for _, quest in data.Quests do
		local def = Quests.ById[quest.Id]
		if def then
			table.insert(list, {
				Text = def.Text,
				Progress = quest.Progress,
				Goal = def.Goal,
				Reward = def.Reward,
				Done = quest.Done,
			})
		end
	end
	player:SetAttribute("Quests", HttpService:JSONEncode(list))
	player:SetAttribute("QuestsResetAt", (data.QuestDay + 1) * 86400)
end

function QuestService.Progress(player: Player?, stat: string, amount: number?)
	if not player or not player.Parent then
		return
	end
	local data = ensureToday(player)
	if not data then
		return
	end
	local changed = false
	for _, quest in data.Quests do
		local def = Quests.ById[quest.Id]
		if def and def.Stat == stat and not quest.Done then
			quest.Progress = math.min(def.Goal, quest.Progress + (amount or 1))
			changed = true
			if quest.Progress >= def.Goal then
				quest.Done = true
				data.Bonks += def.Reward
				resultRemote:FireClient(player, true, string.format("Quest done: %s  +%d Bonks", def.Text, def.Reward))
			end
		end
	end
	if changed then
		DataService.MarkDirty(player)
		publish(player)
	end
end

function QuestService.Init()
	DataService.ProfileLoaded:Connect(publish)

	-- Only arena hits count, so nobody farms quests on the lobby dummies.
	CombatService.OnHit(function(attacker, _victim, kind)
		if not attacker.Player or attacker.Zone ~= "Arena" then
			return
		end
		QuestService.Progress(attacker.Player, "Hits")
		if kind == "Charged" then
			QuestService.Progress(attacker.Player, "Charged")
		elseif kind == "Bump" then
			QuestService.Progress(attacker.Player, "Bumps")
		end
	end)

	-- Roll over to new quests at midnight for anyone already in the game.
	task.spawn(function()
		while true do
			task.wait(60)
			for _, player in game:GetService("Players"):GetPlayers() do
				local data = DataService.GetData(player)
				if data and data.QuestDay ~= Quests.DayNumber(os.time()) then
					publish(player)
				end
			end
		end
	end)
end

return QuestService
