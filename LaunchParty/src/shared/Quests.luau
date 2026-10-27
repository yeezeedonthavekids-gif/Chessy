--!strict
-- Daily quests: 3 a day, the same 3 all day for a given player, reset at midnight UTC.
-- Pure Luau so the daily pick can be unit tested.
local Quests = {}

export type QuestDef = { Id: string, Text: string, Stat: string, Goal: number, Reward: number }

Quests.PerDay = 3

Quests.Pool = {
	{ Id = "kos", Text = "Knock out 5 people", Stat = "KOs", Goal = 5, Reward = 60 },
	{ Id = "charged", Text = "Land 10 charged punches", Stat = "Charged", Goal = 10, Reward = 50 },
	{ Id = "roundwins", Text = "Win 2 rounds", Stat = "RoundWins", Goal = 2, Reward = 70 },
	{ Id = "matches", Text = "Play 3 matches", Stat = "Matches", Goal = 3, Reward = 50 },
	{ Id = "hits", Text = "Land 60 hits", Stat = "Hits", Goal = 60, Reward = 40 },
	{ Id = "bumps", Text = "Dash into people 8 times", Stat = "Bumps", Goal = 8, Reward = 50 },
	{ Id = "bounty", Text = "Knock out whoever has the crown", Stat = "Bounties", Goal = 1, Reward = 80 },
	{ Id = "champion", Text = "Win a whole match", Stat = "MatchWins", Goal = 1, Reward = 100 },
	{ Id = "toptwo", Text = "Finish top 2 in 4 rounds", Stat = "TopTwo", Goal = 4, Reward = 60 },
} :: { QuestDef }

Quests.ById = {} :: { [string]: QuestDef }
for _, def in Quests.Pool do
	Quests.ById[def.Id] = def
end

function Quests.DayNumber(unixTime: number): number
	return math.floor(unixTime / 86400)
end

-- Deterministic pick: same player + same day = same quests (so rejoining doesn't reroll them).
function Quests.PickDaily(day: number, userId: number, count: number): { string }
	local state = (day * 7919 + math.abs(userId) * 104729) % 2147483647
	if state == 0 then
		state = 1
	end
	local function nextNumber(): number
		state = (state * 16807) % 2147483647
		return (state - 1) / 2147483646
	end
	local ids = {}
	for _, def in Quests.Pool do
		table.insert(ids, def.Id)
	end
	for i = #ids, 2, -1 do
		local j = math.floor(nextNumber() * i) + 1
		ids[i], ids[j] = ids[j], ids[i]
	end
	local picked = {}
	for i = 1, math.min(count, #ids) do
		table.insert(picked, ids[i])
	end
	return picked
end

return Quests
