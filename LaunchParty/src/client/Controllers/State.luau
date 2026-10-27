-- Tiny shared client state so controllers can talk without depending on each other.
local comboChanged = Instance.new("BindableEvent")
local bigMessage = Instance.new("BindableEvent")

local State = {
	Charging = false,
	ChargeStart = 0,
	LastPunch = -math.huge,
	LastKnockback = -math.huge,
	DashReady = { 0 },
	Combo = 0,
	LastComboHit = 0,
	ComboChanged = comboChanged,
	-- Fire(text, style, subtitle) to show a local-only announcement.
	BigMessage = bigMessage,
}

function State.MyId(): string
	return "P" .. game:GetService("Players").LocalPlayer.UserId
end

return State
