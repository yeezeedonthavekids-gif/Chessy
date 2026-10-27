-- Knocked out? The camera follows the fight instead of leaving you on the balcony.
-- Starts automatically, follows whoever knocked you out, and you can flip between fighters.
local CollectionService = game:GetService("CollectionService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared:WaitForChild("Net"))

local State = require(script.Parent.State)
local UI = require(script.Parent.UI)

local SpectateController = {}

local player = Players.LocalPlayer
local gameState = Net.GameState()

local active = false
local optedOut = false
local watchingId: string? = nil
local preferredId: string? = nil -- whoever knocked us out

local gui: ScreenGui
local bar: Frame
local nameLabel: TextLabel
local watchButton: TextButton

type Target = { Id: string, Name: string, Model: Model }

-- Fighters still alive in the round, from the scoreboard.
local function aliveTargets(): { Target }
	local ok, rows = pcall(function()
		return HttpService:JSONDecode(gameState:GetAttribute("Scoreboard") or "[]")
	end)
	if not ok or type(rows) ~= "table" then
		return {}
	end
	local models: { [string]: Model } = {}
	for _, model in CollectionService:GetTagged("Fighter") do
		local id = model:GetAttribute("FighterId")
		if type(id) == "string" and model:IsA("Model") then
			models[id] = model
		end
	end
	local list = {}
	for _, row in rows do
		local model = models[row.Id]
		if row.Alive and model and row.Id ~= State.MyId() and model:FindFirstChildOfClass("Humanoid") then
			table.insert(list, { Id = row.Id, Name = tostring(row.Name), Model = model })
		end
	end
	return list
end

local function ownHumanoid(): Humanoid?
	local character = player.Character
	return character and character:FindFirstChildOfClass("Humanoid")
end

local function watch(target: Target?)
	watchingId = if target then target.Id else nil
	if target then
		nameLabel.Text = "Watching " .. target.Name
	end
end

local function stop()
	active = false
	watchingId = nil
	bar.Visible = false
	local humanoid = ownHumanoid()
	if humanoid and Workspace.CurrentCamera then
		Workspace.CurrentCamera.CameraSubject = humanoid
	end
end

local function start()
	active = true
	bar.Visible = true
	watchButton.Visible = false
	local targets = aliveTargets()
	local chosen = targets[1]
	for _, target in targets do
		if target.Id == preferredId then
			chosen = target
		end
	end
	watch(chosen)
	UI.pop(bar, 0.8, 0.25)
end

local function cycle(step: number)
	local targets = aliveTargets()
	if #targets == 0 then
		return
	end
	local index = 0
	for i, target in targets do
		if target.Id == watchingId then
			index = i
		end
	end
	watch(targets[(index - 1 + step) % #targets + 1])
end

local function tick()
	local stateName = gameState:GetAttribute("State")
	local roundRunning = stateName == "Live"
	local inArena = player:GetAttribute("InArena") == true
	local targets = if roundRunning and not inArena then aliveTargets() else {}
	local shouldWatch = roundRunning and not inArena and not optedOut and #targets > 0

	if shouldWatch and not active then
		start()
	elseif not shouldWatch and active then
		stop()
	end
	watchButton.Visible = roundRunning and not inArena and optedOut and #targets > 0

	if not active then
		return
	end
	-- Current target got knocked out? Switch to someone still fighting.
	local current = nil
	for _, target in targets do
		if target.Id == watchingId then
			current = target
		end
	end
	if not current then
		watch(targets[1])
		current = targets[1]
	end
	-- Keep the camera on them (respawning resets the camera to our own character).
	local camera = Workspace.CurrentCamera
	local humanoid = current and current.Model:FindFirstChildOfClass("Humanoid")
	if camera and humanoid and camera.CameraSubject ~= humanoid then
		camera.CameraSubject = humanoid
	end
end

local function build()
	gui = UI.new("ScreenGui", {
		Name = "LaunchPartySpectate",
		ResetOnSpawn = false,
		DisplayOrder = 3,
		Parent = player:WaitForChild("PlayerGui"),
	})

	bar = UI.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -150),
		Size = UDim2.new(0, 380, 0, 84),
		BackgroundTransparency = 1,
		Visible = false,
		Parent = gui,
	})
	local pill = UI.new("Frame", {
		Size = UDim2.new(1, 0, 0, 46),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = bar,
	}, {
		UI.corner(23),
		UI.gradient(Color3.fromRGB(34, 36, 52), Color3.fromRGB(22, 24, 36)),
		UI.stroke(Color3.fromRGB(255, 205, 80), 2),
	})
	nameLabel = UI.label({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(1, -120, 0, 28),
		Text = "Watching",
		Parent = pill,
	})
	local previous = UI.button("<", Color3.fromRGB(70, 74, 96), Color3.fromRGB(50, 53, 70), {
		Position = UDim2.new(0, 6, 0, 5),
		Size = UDim2.new(0, 48, 0, 36),
		Parent = pill,
	})
	previous.Activated:Connect(function()
		cycle(-1)
	end)
	local nextButton = UI.button(">", Color3.fromRGB(70, 74, 96), Color3.fromRGB(50, 53, 70), {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -6, 0, 5),
		Size = UDim2.new(0, 48, 0, 36),
		Parent = pill,
	})
	nextButton.Activated:Connect(function()
		cycle(1)
	end)
	local leave = UI.button("Back to lobby", Color3.fromRGB(70, 74, 96), Color3.fromRGB(50, 53, 70), {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 52),
		Size = UDim2.new(0, 150, 0, 30),
		Parent = bar,
	})
	leave.Activated:Connect(function()
		optedOut = true
		stop()
	end)

	watchButton = UI.button("👀 Watch the fight", Color3.fromRGB(255, 205, 80), Color3.fromRGB(230, 150, 40), {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -150),
		Size = UDim2.new(0, 200, 0, 40),
		Visible = false,
		Parent = gui,
	})
	watchButton.Activated:Connect(function()
		optedOut = false
	end)
end

function SpectateController.Start()
	build()
	-- Follow whoever knocked us out.
	Net.Event("KillFeed").OnClientEvent:Connect(function(data)
		if type(data) == "table" and data.VictimId == State.MyId() then
			preferredId = data.KillerId
		end
	end)
	-- A new round resets the "Back to lobby" choice.
	gameState:GetAttributeChangedSignal("State"):Connect(function()
		if gameState:GetAttribute("State") == "Countdown" then
			optedOut = false
			preferredId = nil
		end
	end)
	task.spawn(function()
		while true do
			task.wait(0.25)
			local ok, err = pcall(tick)
			if not ok then
				warn("[LaunchParty] Spectate error:", err)
			end
		end
	end)
end

return SpectateController
