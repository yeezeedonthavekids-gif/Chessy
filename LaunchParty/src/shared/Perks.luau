--!strict
-- Perk definitions and stat aggregation. Pure Luau so it is unit-testable.
local Perks = {}

export type Stats = {
	KnockDealt: number,
	KnockTaken: number,
	HeatDealt: number,
	HeatTaken: number,
	WalkSpeed: number,
	JumpPower: number,
	PunchCooldownMult: number,
	DashCooldownMult: number,
	DashCharges: number,
	LifeSteal: number,
	ExtraLives: number,
	ChargeSpeed: number,
	BumpMult: number,
	Thorns: number,
	Shockwave: number,
	Scale: number,
}

export type PerkDef = {
	Id: string,
	Name: string,
	Rarity: string,
	MaxStacks: number,
	UnlockLevel: number,
	Description: string,
	Apply: (Stats) -> (),
}

Perks.RarityOrder = { "Common", "Rare", "Legendary" }

function Perks.BaseStats(): Stats
	return {
		KnockDealt = 1,
		KnockTaken = 1,
		HeatDealt = 1,
		HeatTaken = 1,
		WalkSpeed = 16,
		JumpPower = 50,
		PunchCooldownMult = 1,
		DashCooldownMult = 1,
		DashCharges = 1,
		LifeSteal = 0,
		ExtraLives = 0,
		ChargeSpeed = 1,
		BumpMult = 1,
		Thorns = 0,
		Shockwave = 0,
		Scale = 1,
	}
end

local function perk(id: string, name: string, rarity: string, maxStacks: number, unlockLevel: number, description: string, apply: (Stats) -> ()): PerkDef
	return {
		Id = id,
		Name = name,
		Rarity = rarity,
		MaxStacks = maxStacks,
		UnlockLevel = unlockLevel,
		Description = description,
		Apply = apply,
	}
end

Perks.List = {
	-- Common
	perk("rocket_fist", "Rocket Fist", "Common", 5, 1, "+15% knockback dealt.", function(s)
		s.KnockDealt += 0.15
	end),
	perk("heavyweight", "Heavyweight", "Common", 4, 1, "-12% knockback taken, slightly slower.", function(s)
		s.KnockTaken -= 0.12
		s.WalkSpeed -= 1
	end),
	perk("turbo_sneakers", "Turbo Sneakers", "Common", 4, 1, "+2.5 walk speed.", function(s)
		s.WalkSpeed += 2.5
	end),
	perk("quick_jab", "Quick Jab", "Common", 3, 1, "Punch cooldown -15%.", function(s)
		s.PunchCooldownMult -= 0.15
	end),
	perk("spring_legs", "Spring Legs", "Common", 3, 1, "+10 jump power.", function(s)
		s.JumpPower += 10
	end),
	perk("second_gear", "Second Gear", "Common", 3, 1, "Dash cooldown -20%.", function(s)
		s.DashCooldownMult -= 0.2
	end),
	perk("thick_skin", "Thick Skin", "Common", 4, 1, "Take 15% less heat.", function(s)
		s.HeatTaken -= 0.15
	end),
	perk("spicy_knuckles", "Spicy Knuckles", "Common", 4, 1, "Deal 20% more heat.", function(s)
		s.HeatDealt += 0.2
	end),
	-- Rare
	perk("double_dash", "Double Dash", "Rare", 2, 1, "+1 dash charge. Recover like a pro.", function(s)
		s.DashCharges += 1
	end),
	perk("vampire_fist", "Vampire Fist", "Rare", 3, 1, "Every hit cools your own heat by 4%.", function(s)
		s.LifeSteal += 4
	end),
	perk("spiked_armor", "Spiked Armor", "Rare", 2, 2, "Attackers take 35% of the heat they deal you.", function(s)
		s.Thorns += 0.35
	end),
	perk("bumper_car", "Bumper Car", "Rare", 2, 2, "Dash bumps hit twice as hard.", function(s)
		s.BumpMult += 1
	end),
	perk("overcharger", "Overcharger", "Rare", 2, 4, "Charge punches 40% faster.", function(s)
		s.ChargeSpeed += 0.4
	end),
	-- Legendary
	perk("second_wind", "Second Wind", "Legendary", 2, 1, "Once per round, the void spits you back out.", function(s)
		s.ExtraLives += 1
	end),
	perk("glass_cannon", "Glass Cannon", "Legendary", 2, 3, "+50% knockback dealt, +35% knockback taken.", function(s)
		s.KnockDealt += 0.5
		s.KnockTaken += 0.35
	end),
	perk("titan", "Titan", "Legendary", 2, 5, "Grow 20% bigger. Harder to move, hits harder, a bit slower.", function(s)
		s.Scale += 0.2
		s.KnockTaken -= 0.2
		s.KnockDealt += 0.1
		s.WalkSpeed -= 1.5
	end),
	perk("shockwave_fist", "Shockwave Fist", "Legendary", 1, 7, "Charged punches blast EVERYONE around you.", function(s)
		s.Shockwave += 1
	end),
}

Perks.ById = {} :: { [string]: PerkDef }
for _, def in Perks.List do
	Perks.ById[def.Id] = def
end

-- Builds final stats from an owned-perk map { [perkId] = stacks }. Order is deterministic.
function Perks.Compute(owned: { [string]: number }): Stats
	local stats = Perks.BaseStats()
	for _, def in Perks.List do
		local stacks = math.min(owned[def.Id] or 0, def.MaxStacks)
		for _ = 1, stacks do
			def.Apply(stats)
		end
	end
	stats.KnockTaken = math.max(stats.KnockTaken, 0.4)
	stats.HeatTaken = math.max(stats.HeatTaken, 0.4)
	stats.WalkSpeed = math.max(stats.WalkSpeed, 10)
	stats.PunchCooldownMult = math.max(stats.PunchCooldownMult, 0.45)
	stats.DashCooldownMult = math.max(stats.DashCooldownMult, 0.35)
	stats.DashCharges = math.floor(stats.DashCharges)
	return stats
end

-- Perks a player of the given level can be offered.
function Perks.Pool(level: number): { PerkDef }
	local pool = {}
	for _, def in Perks.List do
		if def.UnlockLevel <= level then
			table.insert(pool, def)
		end
	end
	return pool
end

return Perks
