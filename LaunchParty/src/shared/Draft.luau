--!strict
-- Roguelike card draft: weighted rarity rolls with catch-up "luck" for players who placed low.
local Draft = {}

type PerkLike = { Id: string, Rarity: string, MaxStacks: number }
type RNG = { NextNumber: (any) -> number }

local ORDER = { "Common", "Rare", "Legendary" }

function Draft.Weights(luck: number): { [string]: number }
	luck = math.clamp(luck, 0, 1)
	return {
		Common = 70 - 40 * luck,
		Rare = 25 + 22 * luck,
		Legendary = 5 + 18 * luck,
	}
end

-- Returns up to `count` distinct perks from `pool`, skipping perks already at max stacks.
function Draft.Roll(pool: { PerkLike }, owned: { [string]: number }, count: number, luck: number, rng: RNG): { PerkLike }
	local weights = Draft.Weights(luck)
	local buckets: { [string]: { PerkLike } } = {}
	for _, def in pool do
		if (owned[def.Id] or 0) < def.MaxStacks and weights[def.Rarity] then
			local bucket = buckets[def.Rarity]
			if not bucket then
				bucket = {}
				buckets[def.Rarity] = bucket
			end
			table.insert(bucket, def)
		end
	end

	local picks = {}
	for _ = 1, count do
		local total = 0
		local lastNonEmpty: string? = nil
		for _, rarity in ORDER do
			local bucket = buckets[rarity]
			if bucket and #bucket > 0 then
				total += weights[rarity]
				lastNonEmpty = rarity
			end
		end
		if total <= 0 or not lastNonEmpty then
			break
		end

		local roll = rng:NextNumber() * total
		local chosen: string = lastNonEmpty
		for _, rarity in ORDER do
			local bucket = buckets[rarity]
			if bucket and #bucket > 0 then
				roll -= weights[rarity]
				if roll < 0 then
					chosen = rarity
					break
				end
			end
		end

		local bucket = buckets[chosen]
		local index = math.clamp(math.floor(rng:NextNumber() * #bucket) + 1, 1, #bucket)
		table.insert(picks, (table.remove(bucket, index) :: any) :: PerkLike)
	end
	return picks
end

return Draft
