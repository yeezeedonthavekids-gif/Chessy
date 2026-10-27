--!strict
-- Pure knockback math (no Roblox APIs) so it can be unit tested outside Studio.
local Knockback = {}

export type Tuning = {
	HeatScale: number,
	VerticalRatio: number,
	VerticalBase: number,
	MaxKnockSpeed: number,
	TumbleBase: number,
	TumblePerSpeed: number,
	TumbleMax: number,
}

-- Horizontal launch speed in studs/sec. Heat makes everything hit harder.
function Knockback.Speed(base: number, heat: number, dealtMult: number, takenMult: number, tuning: Tuning): number
	local raw = base * dealtMult * takenMult * (1 + math.max(heat, 0) * tuning.HeatScale)
	return math.clamp(raw, 0, tuning.MaxKnockSpeed)
end

-- Upward speed paired with a horizontal launch so victims actually leave the ground.
function Knockback.Vertical(speed: number, tuning: Tuning): number
	return speed * tuning.VerticalRatio + tuning.VerticalBase
end

-- How long the victim tumbles (loses control) after a launch.
function Knockback.Tumble(speed: number, tuning: Tuning): number
	return math.min(tuning.TumbleBase + speed * tuning.TumblePerSpeed, tuning.TumbleMax)
end

-- Ballistic horizontal distance on flat ground, ignoring friction. Used for tuning and tests.
function Knockback.FlightDistance(speed: number, tuning: Tuning, gravity: number): number
	local vy = Knockback.Vertical(speed, tuning)
	return speed * (2 * vy / gravity)
end

-- 1 = cool, 2 = warm, 3 = hot, 4 = critical
function Knockback.HeatTier(heat: number): number
	if heat >= 150 then
		return 4
	elseif heat >= 100 then
		return 3
	elseif heat >= 50 then
		return 2
	end
	return 1
end

return Knockback
