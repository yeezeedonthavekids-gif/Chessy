-- Unit tests for the pure gameplay modules. Run from the LaunchParty folder with:
--   luau tests/run.luau
local Draft = require("../src/shared/Draft")
local Knockback = require("../src/shared/Knockback")
local Perks = require("../src/shared/Perks")
local Progression = require("../src/shared/Progression")
local Quests = require("../src/shared/Quests")

local passed, failed = 0, 0

local function test(name: string, fn: () -> ())
	local ok, err = pcall(fn)
	if ok then
		passed += 1
	else
		failed += 1
		print("FAIL  " .. name .. "\n      " .. tostring(err))
	end
end

local function expect(condition: any, message: string?)
	if not condition then
		error(message or "expectation failed", 2)
	end
end

local function near(a: number, b: number, epsilon: number?): boolean
	return math.abs(a - b) <= (epsilon or 1e-6)
end

-- Deterministic stand-in for Roblox's Random.
local function seededRng(seed: number)
	-- Park-Miller LCG: products stay below 2^53, so it's exact in doubles.
	local state = math.max(1, seed % 2147483647)
	return {
		NextNumber = function(_self)
			state = (state * 16807) % 2147483647
			return (state - 1) / 2147483646
		end,
	}
end

-- Same values as Config.Combat (Config itself uses Roblox types).
local TUNING = {
	HeatScale = 0.025,
	VerticalRatio = 0.42,
	VerticalBase = 10,
	MaxKnockSpeed = 230,
	TumbleBase = 0.3,
	TumblePerSpeed = 1 / 220,
	TumbleMax = 1.4,
}
local GRAVITY = 196.2

-- Knockback ----------------------------------------------------------------------

test("knockback grows with heat", function()
	local cold = Knockback.Speed(30, 0, 1, 1, TUNING)
	local hot = Knockback.Speed(30, 100, 1, 1, TUNING)
	expect(near(cold, 30), "0% heat jab should be base speed")
	expect(near(hot, 105), "100% heat jab should be 3.5x base")
end)

test("knockback is clamped", function()
	expect(Knockback.Speed(30, 5000, 3, 3, TUNING) == TUNING.MaxKnockSpeed)
	expect(Knockback.Speed(30, -50, 1, 1, TUNING) == 30, "negative heat treated as zero")
end)

test("a cold jab barely moves you, a hot jab ejects you", function()
	local arenaRadius = 46
	local cold = Knockback.FlightDistance(Knockback.Speed(30, 0, 1, 1, TUNING), TUNING, GRAVITY)
	local hot = Knockback.FlightDistance(Knockback.Speed(30, 150, 1, 1, TUNING), TUNING, GRAVITY)
	expect(cold < 10, "cold jab flew " .. cold)
	expect(hot > arenaRadius * 1.5, "150% jab only flew " .. hot)
end)

test("a full charged punch at medium heat is a finisher", function()
	local speed = Knockback.Speed(30 * 2.3, 60, 1, 1, TUNING)
	expect(Knockback.FlightDistance(speed, TUNING, GRAVITY) > 46)
end)

test("tumble time is bounded", function()
	expect(near(Knockback.Tumble(0, TUNING), 0.3))
	expect(Knockback.Tumble(10000, TUNING) == TUNING.TumbleMax)
end)

test("heat tiers", function()
	expect(Knockback.HeatTier(0) == 1)
	expect(Knockback.HeatTier(50) == 2)
	expect(Knockback.HeatTier(120) == 3)
	expect(Knockback.HeatTier(400) == 4)
end)

-- Perks --------------------------------------------------------------------------

test("base stats with no perks", function()
	local stats = Perks.Compute({})
	expect(stats.WalkSpeed == 16 and stats.DashCharges == 1 and stats.KnockDealt == 1)
end)

test("perks stack and respect max stacks", function()
	local stats = Perks.Compute({ rocket_fist = 2 })
	expect(near(stats.KnockDealt, 1.3))
	local capped = Perks.Compute({ double_dash = 99 })
	expect(capped.DashCharges == 3, "double dash max 2 stacks -> 3 charges, got " .. capped.DashCharges)
end)

test("stats are clamped to sane minimums", function()
	local stats = Perks.Compute({ heavyweight = 4, titan = 2 })
	expect(stats.KnockTaken >= 0.4)
	expect(stats.WalkSpeed >= 10)
	local fast = Perks.Compute({ quick_jab = 3, second_gear = 3 })
	expect(fast.PunchCooldownMult >= 0.45 and fast.DashCooldownMult >= 0.35)
end)

test("unknown perk ids are ignored", function()
	local stats = Perks.Compute({ not_a_perk = 3 })
	expect(stats.KnockDealt == 1)
end)

test("perk ids are unique and well formed", function()
	local seen = {}
	for _, def in Perks.List do
		expect(not seen[def.Id], "duplicate id " .. def.Id)
		seen[def.Id] = true
		expect(def.MaxStacks >= 1, def.Id .. " max stacks")
		expect(def.Rarity == "Common" or def.Rarity == "Rare" or def.Rarity == "Legendary", def.Id .. " rarity")
		expect(#def.Description > 0, def.Id .. " description")
	end
end)

test("level 1 pool excludes locked perks", function()
	for _, def in Perks.Pool(1) do
		expect(def.UnlockLevel <= 1, def.Id .. " should be locked")
	end
	expect(#Perks.Pool(99) == #Perks.List)
end)

-- Draft --------------------------------------------------------------------------

test("draft returns distinct cards", function()
	local rng = seededRng(42)
	for _ = 1, 200 do
		local cards = Draft.Roll(Perks.List, {}, 3, rng:NextNumber(), rng)
		expect(#cards == 3)
		expect(cards[1].Id ~= cards[2].Id and cards[2].Id ~= cards[3].Id and cards[1].Id ~= cards[3].Id)
	end
end)

test("draft never offers maxed perks", function()
	local owned = {}
	for _, def in Perks.List do
		owned[def.Id] = def.MaxStacks
	end
	owned.rocket_fist = 0
	local cards = Draft.Roll(Perks.List, owned, 3, 0.5, seededRng(7))
	expect(#cards == 1 and cards[1].Id == "rocket_fist", "only rocket_fist is still available")
end)

test("draft handles an empty pool", function()
	expect(#Draft.Roll({}, {}, 3, 0.5, seededRng(1)) == 0)
end)

test("luck shifts rarity toward legendaries", function()
	local function legendaryRate(luck: number): number
		local rng = seededRng(99)
		local legendary, total = 0, 0
		for _ = 1, 3000 do
			for _, card in Draft.Roll(Perks.List, {}, 1, luck, rng) do
				total += 1
				if card.Rarity == "Legendary" then
					legendary += 1
				end
			end
		end
		return legendary / total
	end
	local unlucky, lucky = legendaryRate(0), legendaryRate(1)
	expect(lucky > unlucky * 2.5, string.format("lucky %.3f vs unlucky %.3f", lucky, unlucky))
end)

-- Progression ----------------------------------------------------------------------

test("level curve", function()
	expect(Progression.FromXP(0) == 1)
	expect(Progression.FromXP(99) == 1)
	expect(Progression.FromXP(100) == 2)
	local level, into, needed = Progression.FromXP(100 + 160 + 5)
	expect(level == 3 and into == 5 and needed == 220, string.format("%d %d %d", level, into, needed))
	expect(Progression.FromXP(-50) == 1)
	expect(Progression.FromXP(1e12) == Progression.MaxLevel)
end)

test("titles by level", function()
	local tier, name = Progression.TitleFor(1)
	expect(tier == 1 and name == "Rookie")
	tier, name = Progression.TitleFor(9)
	expect(tier == 4 and name == "Launcher")
	tier, name = Progression.TitleFor(500)
	expect(name == "Living Legend")
end)

test("match xp rewards winning and doubles the daily first win", function()
	local loss = Progression.MatchXP({ Points = 0, KOs = 0, Placement = 4, Won = false, DailyBonus = false })
	local win = Progression.MatchXP({ Points = 10, KOs = 3, Placement = 1, Won = true, DailyBonus = false })
	local daily = Progression.MatchXP({ Points = 10, KOs = 3, Placement = 1, Won = true, DailyBonus = true })
	expect(loss == 25)
	expect(win == 25 + 120 + 15 + 75)
	expect(daily == win * 2)
	local notWinner = Progression.MatchXP({ Points = 0, KOs = 0, Placement = 2, Won = false, DailyBonus = true })
	expect(notWinner == 60, "daily bonus only applies to wins")
end)

-- Quests ----------------------------------------------------------------------------------

test("daily quests are stable for a player and day", function()
	local a = Quests.PickDaily(20000, 12345, 3)
	local b = Quests.PickDaily(20000, 12345, 3)
	expect(#a == 3 and a[1] == b[1] and a[2] == b[2] and a[3] == b[3])
end)

test("daily quests are distinct and valid", function()
	for day = 19000, 19200 do
		local picked = Quests.PickDaily(day, day * 31, 3)
		expect(#picked == 3)
		expect(picked[1] ~= picked[2] and picked[2] ~= picked[3] and picked[1] ~= picked[3])
		for _, id in picked do
			expect(Quests.ById[id] ~= nil, "unknown quest " .. id)
		end
	end
end)

test("daily quests change from day to day", function()
	local changes = 0
	for day = 19000, 19030 do
		local today, tomorrow = Quests.PickDaily(day, 777, 3), Quests.PickDaily(day + 1, 777, 3)
		if today[1] ~= tomorrow[1] or today[2] ~= tomorrow[2] or today[3] ~= tomorrow[3] then
			changes += 1
		end
	end
	expect(changes >= 25, "only changed on " .. changes .. " of 31 days")
end)

print(string.format("\n%d passed, %d failed", passed, failed))
if failed > 0 then
	error("tests failed")
end
