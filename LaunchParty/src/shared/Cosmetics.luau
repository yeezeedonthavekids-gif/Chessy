-- Visual identity helpers used by both server (tags, trails) and client (HUD).
local Cosmetics = {}

Cosmetics.RarityColors = {
	Common = Color3.fromRGB(185, 196, 214),
	Rare = Color3.fromRGB(70, 160, 255),
	Legendary = Color3.fromRGB(255, 184, 40),
}

-- One trail per title tier (see Shared/Progression.Titles).
Cosmetics.Trails = {
	ColorSequence.new(Color3.fromRGB(255, 255, 255)),
	ColorSequence.new(Color3.fromRGB(90, 230, 255)),
	ColorSequence.new(Color3.fromRGB(140, 255, 90)),
	ColorSequence.new(Color3.fromRGB(255, 150, 40), Color3.fromRGB(255, 70, 40)),
	ColorSequence.new(Color3.fromRGB(255, 80, 220), Color3.fromRGB(120, 80, 255)),
	ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 70, 70)),
		ColorSequenceKeypoint.new(0.25, Color3.fromRGB(255, 220, 60)),
		ColorSequenceKeypoint.new(0.5, Color3.fromRGB(80, 255, 120)),
		ColorSequenceKeypoint.new(0.75, Color3.fromRGB(70, 160, 255)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(200, 90, 255)),
	}),
}

local HEAT_STOPS = {
	{ 0, Color3.fromRGB(255, 255, 255) },
	{ 50, Color3.fromRGB(255, 228, 92) },
	{ 100, Color3.fromRGB(255, 140, 40) },
	{ 150, Color3.fromRGB(255, 50, 50) },
	{ 220, Color3.fromRGB(190, 20, 60) },
}

function Cosmetics.HeatColor(heat: number): Color3
	if heat <= HEAT_STOPS[1][1] then
		return HEAT_STOPS[1][2]
	end
	for i = 2, #HEAT_STOPS do
		local prev, nextStop = HEAT_STOPS[i - 1], HEAT_STOPS[i]
		if heat <= nextStop[1] then
			local alpha = (heat - prev[1]) / (nextStop[1] - prev[1])
			return (prev[2] :: Color3):Lerp(nextStop[2] :: Color3, alpha)
		end
	end
	return HEAT_STOPS[#HEAT_STOPS][2]
end

function Cosmetics.TrailFor(tier: number): ColorSequence
	return Cosmetics.Trails[math.clamp(tier, 1, #Cosmetics.Trails)]
end

return Cosmetics
