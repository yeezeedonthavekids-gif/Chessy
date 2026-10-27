--!strict
-- Persistent progression math: levels, titles and match XP. Pure Luau.
local Progression = {}

Progression.MaxLevel = 100

Progression.Titles = {
	{ Level = 1, Name = "Rookie" },
	{ Level = 3, Name = "Brawler" },
	{ Level = 5, Name = "Bruiser" },
	{ Level = 8, Name = "Launcher" },
	{ Level = 12, Name = "Yeetmaster" },
	{ Level = 20, Name = "Living Legend" },
}

-- XP needed to advance from `level` to `level + 1`.
function Progression.XPForLevel(level: number): number
	return 100 + (level - 1) * 60
end

-- Returns level, xp into the current level, xp needed for the next level.
function Progression.FromXP(totalXP: number): (number, number, number)
	local level = 1
	local remaining = math.max(0, math.floor(totalXP))
	while level < Progression.MaxLevel and remaining >= Progression.XPForLevel(level) do
		remaining -= Progression.XPForLevel(level)
		level += 1
	end
	return level, remaining, Progression.XPForLevel(level)
end

-- Returns tier index (1-based, also used for trail colours) and title name.
function Progression.TitleFor(level: number): (number, string)
	local tier, name = 1, Progression.Titles[1].Name
	for index, entry in Progression.Titles do
		if level >= entry.Level then
			tier, name = index, entry.Name
		end
	end
	return tier, name
end

export type MatchResult = {
	Points: number,
	KOs: number,
	Placement: number,
	Won: boolean,
	DailyBonus: boolean,
}

function Progression.MatchXP(result: MatchResult): (number, { string })
	local breakdown = {}
	local xp = 25
	table.insert(breakdown, "Played a match +25")
	if result.Points > 0 then
		xp += result.Points * 12
		table.insert(breakdown, string.format("%d points +%d", result.Points, result.Points * 12))
	end
	if result.KOs > 0 then
		xp += result.KOs * 5
		table.insert(breakdown, string.format("%d KOs +%d", result.KOs, result.KOs * 5))
	end
	if result.Won then
		xp += 75
		table.insert(breakdown, "Champion +75")
	elseif result.Placement == 2 then
		xp += 35
		table.insert(breakdown, "2nd place +35")
	elseif result.Placement == 3 then
		xp += 20
		table.insert(breakdown, "3rd place +20")
	end
	if result.Won and result.DailyBonus then
		xp *= 2
		table.insert(breakdown, "First win of the day x2")
	end
	return math.floor(xp), breakdown
end

return Progression
