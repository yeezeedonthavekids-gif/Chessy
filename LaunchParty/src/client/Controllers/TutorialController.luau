-- First-time tutorial. Some steps wait for you to actually do the thing (punch, charge, dash).
-- Runs automatically once, and again any time from the HOW TO PLAY button.
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared:WaitForChild("Net"))

local State = require(script.Parent.State)
local UI = require(script.Parent.UI)

local TutorialController = {}

local player = Players.LocalPlayer
local doneRemote = Net.Event("TutorialDone")

type Step = { Title: string, Body: string, Touch: string?, Wait: string, Button: string? }

local STEPS: { Step } = {
	{
		Title = "Hey, welcome to Launch Party!",
		Body = "Quick tutorial. Takes like 30 seconds.",
		Wait = "next",
		Button = "Let's go",
	},
	{
		Title = "Punch something",
		Body = "Walk up to one of the glowing dummies and click to punch it.",
		Touch = "Walk up to one of the glowing dummies and tap PUNCH.",
		Wait = "jab",
	},
	{
		Title = "Now a big one",
		Body = "Hold click for about a second, then let go. Charged punches send people way further.",
		Touch = "Hold PUNCH for about a second, then let go. Charged punches send people way further.",
		Wait = "charged",
	},
	{
		Title = "Dash",
		Body = "Press Q or Shift to dash. Dash into people to bump them. It works in the air too.",
		Touch = "Tap DASH. Dash into people to bump them. It works in the air too.",
		Wait = "dash",
	},
	{
		Title = "What's the % for?",
		Body = "That number over everyone's head is their heat. Every hit raises it, and the higher it is, the further they fly. Knock everyone off the island to win the round.",
		Wait = "next",
		Button = "Got it",
	},
	{
		Title = "Perks",
		Body = "After each round you pick 1 of 3 perk cards. They stack until the match ends, so you can make some pretty dumb combos.",
		Wait = "next",
		Button = "Nice",
	},
	{
		Title = "Last tip",
		Body = "Got launched? Don't panic. Dash back toward the island while you're in the air. That's it, have fun!",
		Wait = "next",
		Button = "Done",
	},
}

local gui: ScreenGui? = nil
local running = false
local stepIndex = 0
local stepToken = 0
local highlights: { Highlight } = {}

local function isTouch(): boolean
	return UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
end

local function clearHighlights()
	for _, highlight in highlights do
		highlight:Destroy()
	end
	table.clear(highlights)
end

local function highlightDummies()
	clearHighlights()
	for _, model in CollectionService:GetTagged("Fighter") do
		local id = model:GetAttribute("FighterId")
		if type(id) == "string" and string.sub(id, 1, 1) == "D" then
			local highlight = Instance.new("Highlight")
			highlight.FillColor = Color3.fromRGB(255, 220, 80)
			highlight.OutlineColor = Color3.fromRGB(255, 255, 255)
			highlight.FillTransparency = 0.55
			highlight.Parent = model
			table.insert(highlights, highlight)
		end
	end
end

local function finish(completed: boolean)
	running = false
	stepToken += 1
	clearHighlights()
	if gui then
		gui:Destroy()
		gui = nil
	end
	if player:GetAttribute("TutorialDone") ~= true then
		doneRemote:FireServer()
	end
	if completed then
		State.BigMessage:Fire("YOU'RE READY", "Small", "Go launch some people.")
	end
end

local showStep: (number) -> ()

local function advance()
	if stepIndex >= #STEPS then
		finish(true)
	else
		showStep(stepIndex + 1)
	end
end

-- Called when the player does something the current step is waiting for.
local function completeAction(kind: string)
	if not running or not gui then
		return
	end
	local step = STEPS[stepIndex]
	if not step or step.Wait ~= kind then
		return
	end
	stepToken += 1
	local token = stepToken
	local card = gui:FindFirstChild("Card")
	local status = card and card:FindFirstChild("Status")
	if status and status:IsA("TextLabel") then
		status.Text = "Nice! ✓"
		status.TextColor3 = Color3.fromRGB(140, 255, 120)
		UI.pop(status, 1.5, 0.3)
	end
	task.delay(0.9, function()
		if token == stepToken and running then
			advance()
		end
	end)
end

showStep = function(index: number)
	stepIndex = index
	stepToken += 1
	local step = STEPS[index]
	if gui then
		gui:Destroy()
	end
	local screen = UI.new("ScreenGui", {
		Name = "LaunchPartyTutorial",
		ResetOnSpawn = false,
		DisplayOrder = 4,
		Parent = player:WaitForChild("PlayerGui"),
	})
	gui = screen

	local card = UI.new("Frame", {
		Name = "Card",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 86),
		Size = UDim2.new(0.9, 0, 0, 150),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = screen,
	}, {
		UI.corner(16),
		UI.gradient(Color3.fromRGB(255, 130, 190), Color3.fromRGB(130, 90, 255), 0),
		UI.stroke(Color3.fromRGB(255, 255, 255), 3),
		UI.new("UISizeConstraint", { MaxSize = Vector2.new(520, 150) }),
	})

	UI.label({
		Position = UDim2.new(0, 14, 0, 8),
		Size = UDim2.new(0, 60, 0, 18),
		Font = UI.BodyFont,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(255, 240, 200),
		Text = string.format("%d / %d", index, #STEPS),
		Parent = card,
	})
	local title = UI.label({
		Position = UDim2.new(0, 14, 0, 24),
		Size = UDim2.new(1, -28, 0, 30),
		Text = step.Title,
		Parent = card,
	})
	UI.textStroke(2).Parent = title
	local body = UI.label({
		Position = UDim2.new(0, 14, 0, 56),
		Size = UDim2.new(1, -28, 0, 50),
		Font = UI.BodyFont,
		TextScaled = false,
		TextSize = 16,
		TextWrapped = true,
		TextYAlignment = Enum.TextYAlignment.Top,
		Text = if isTouch() and step.Touch then step.Touch else step.Body,
		Parent = card,
	})
	UI.textStroke(1).Parent = body

	if step.Wait == "next" then
		local button = UI.button(step.Button or "Next", Color3.fromRGB(255, 215, 70), Color3.fromRGB(255, 150, 30), {
			AnchorPoint = Vector2.new(1, 1),
			Position = UDim2.new(1, -12, 1, -10),
			Size = UDim2.new(0, 130, 0, 34),
			Parent = card,
		})
		button.Activated:Connect(advance)
	else
		local status = UI.label({
			Name = "Status",
			AnchorPoint = Vector2.new(1, 1),
			Position = UDim2.new(1, -12, 1, -12),
			Size = UDim2.new(0, 160, 0, 26),
			TextColor3 = Color3.fromRGB(255, 240, 160),
			Text = "Your turn...",
			Parent = card,
		})
		UI.textStroke(1.5).Parent = status
	end

	local skip = UI.label({
		Name = "Skip",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 14, 1, -12),
		Size = UDim2.new(0, 120, 0, 20),
		Font = UI.BodyFont,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextTransparency = 0.3,
		Text = "Skip tutorial",
		Parent = card,
	})
	local skipButton = UI.new("TextButton", {
		BackgroundTransparency = 1,
		Text = "",
		Size = UDim2.fromScale(1, 1),
		Parent = skip,
	})
	skipButton.Activated:Connect(function()
		finish(false)
	end)

	if step.Wait == "jab" or step.Wait == "charged" then
		highlightDummies()
	else
		clearHighlights()
	end
	UI.pop(card, 0.8, 0.3)
end

function TutorialController.Begin()
	running = true
	showStep(1)
end

function TutorialController.Start()
	Net.Event("Effect").OnClientEvent:Connect(function(kind, data)
		if kind ~= "Hit" or type(data) ~= "table" or data.Attacker ~= State.MyId() then
			return
		end
		if data.Kind == "Charged" or data.Kind == "Shockwave" then
			completeAction("charged")
		end
		completeAction("jab")
	end)
	State.Dashed.Event:Connect(function()
		completeAction("dash")
	end)

	-- First time playing? Start automatically once the profile has loaded.
	task.spawn(function()
		while player:GetAttribute("TutorialDone") == nil do
			player:GetAttributeChangedSignal("TutorialDone"):Wait()
		end
		if player:GetAttribute("TutorialDone") == false and not running then
			task.wait(2)
			TutorialController.Begin()
		end
	end)
end

return TutorialController
