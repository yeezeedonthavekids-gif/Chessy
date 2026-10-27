-- LAUNCH PARTY client bootstrap.
local Controllers = script:WaitForChild("Controllers")

local ORDER = {
	"AnimationController",
	"EffectsController",
	"ShopController",
	"TutorialController",
	"HUDController",
	"DraftController",
	"InputController",
}

for _, name in ORDER do
	local ok, controller = pcall(require, Controllers:WaitForChild(name))
	if not ok then
		warn("[LaunchParty] Failed to load", name, controller)
		continue
	end
	local started, err = pcall(controller.Start)
	if not started then
		warn("[LaunchParty] Failed to start", name, err)
	end
end
