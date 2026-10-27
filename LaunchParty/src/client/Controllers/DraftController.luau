-- Between-round card picker. Click, tap, press 1/2/3, or use a gamepad.
local GuiService = game:GetService("GuiService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Cosmetics = require(Shared:WaitForChild("Cosmetics"))
local Net = require(Shared:WaitForChild("Net"))

local EffectsController = require(script.Parent.EffectsController)
local UI = require(script.Parent.UI)

local DraftController = {}

local player = Players.LocalPlayer
local pickRemote = Net.Event("DraftPick")

local overlay: Frame? = nil
local picked = false
local cardButtons: { TextButton } = {}
local timerConnection: RBXScriptConnection? = nil

local function close()
	if timerConnection then
		timerConnection:Disconnect()
		timerConnection = nil
	end
	if overlay then
		overlay:Destroy()
		overlay = nil
	end
	table.clear(cardButtons)
	if GuiService.SelectedObject and not GuiService.SelectedObject:IsDescendantOf(player.PlayerGui) then
		GuiService.SelectedObject = nil
	end
end

local function choose(index: number)
	if picked or not overlay or not cardButtons[index] then
		return
	end
	picked = true
	pickRemote:FireServer(index)
	EffectsController.PlaySound(Config.Sounds.Pick, nil, 0.6, 1.2)
	for i, button in cardButtons do
		if i == index then
			UI.pop(button, 1.15, 0.3)
			local stroke = button:FindFirstChildOfClass("UIStroke")
			if stroke then
				stroke.Thickness = 5
			end
		else
			UI.tween(button, 0.25, { BackgroundTransparency = 0.7 })
			for _, child in button:GetDescendants() do
				if child:IsA("TextLabel") then
					UI.tween(child, 0.25, { TextTransparency = 0.6 })
				end
			end
		end
	end
	local status = overlay:FindFirstChild("Status") :: TextLabel?
	if status then
		status.Text = "Locked in! Waiting for everyone else…"
	end
end

local function buildCard(index: number, card: { [string]: any }, parent: Instance): TextButton
	local color = Cosmetics.RarityColors[card.Rarity] or Color3.new(1, 1, 1)
	local button = UI.new("TextButton", {
		Name = "Card" .. index,
		LayoutOrder = index,
		Size = UDim2.new(0, 210, 0, 270),
		BackgroundColor3 = Color3.fromRGB(28, 30, 46),
		AutoButtonColor = false,
		Text = "",
		Parent = parent,
	}, {
		UI.corner(16),
		UI.stroke(color, 3),
		UI.new("UIPadding", {
			PaddingTop = UDim.new(0, 12),
			PaddingBottom = UDim.new(0, 12),
			PaddingLeft = UDim.new(0, 12),
			PaddingRight = UDim.new(0, 12),
		}),
	})
	UI.new("UIGradient", {
		Rotation = 90,
		Color = ColorSequence.new(Color3.new(1, 1, 1), Color3.fromRGB(170, 170, 190)),
		Parent = button,
	})

	UI.label({
		Name = "Rarity",
		Size = UDim2.new(1, 0, 0, 22),
		Font = UI.BodyFont,
		TextColor3 = color,
		Text = string.upper(card.Rarity),
		Parent = button,
	})
	UI.label({
		Name = "PerkName",
		Position = UDim2.new(0, 0, 0, 30),
		Size = UDim2.new(1, 0, 0, 56),
		Text = card.Name,
		Parent = button,
	})
	UI.label({
		Name = "Description",
		Position = UDim2.new(0, 0, 0, 96),
		Size = UDim2.new(1, 0, 0, 100),
		Font = UI.BodyFont,
		TextScaled = false,
		TextSize = 17,
		TextWrapped = true,
		TextYAlignment = Enum.TextYAlignment.Top,
		TextColor3 = Color3.fromRGB(220, 225, 240),
		Text = card.Description,
		Parent = button,
	})
	local owned = tonumber(card.Owned) or 0
	UI.label({
		Name = "Stacks",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 0, 1, -24),
		Size = UDim2.new(1, 0, 0, 18),
		Font = UI.BodyFont,
		TextColor3 = Color3.fromRGB(170, 175, 195),
		Text = if owned > 0 then string.format("Owned %d / %d", owned, card.MaxStacks) else "NEW",
		Parent = button,
	})
	UI.label({
		Name = "Hotkey",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 0, 1, 0),
		Size = UDim2.new(1, 0, 0, 20),
		Font = UI.BodyFont,
		TextColor3 = color,
		Text = string.format("[%d]", index),
		Parent = button,
	})

	button.MouseEnter:Connect(function()
		if not picked then
			UI.pop(button, 1.06, 0.15)
		end
	end)
	button.Activated:Connect(function()
		choose(index)
	end)
	return button
end

local function open(cards: { { [string]: any } }, endsAt: number)
	close()
	picked = false
	local gui = player.PlayerGui:FindFirstChild("LaunchPartyHUD") or player.PlayerGui

	local root = UI.new("Frame", {
		Name = "DraftOverlay",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.45,
		ZIndex = 10,
		Parent = gui,
	})
	overlay = root

	UI.label({
		Name = "Title",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.12, 0),
		Size = UDim2.new(0.8, 0, 0, 60),
		Text = "PICK A PERK",
		TextColor3 = Color3.fromRGB(255, 210, 70),
		Parent = root,
	})
	UI.label({
		Name = "Status",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.12, 64),
		Size = UDim2.new(0.8, 0, 0, 24),
		Font = UI.BodyFont,
		Text = "Perks stack for the rest of the match.",
		Parent = root,
	})

	local row = UI.new("Frame", {
		Name = "Cards",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.55),
		Size = UDim2.new(0, 690, 0, 290),
		BackgroundTransparency = 1,
		Parent = root,
	}, {
		UI.new("UIListLayout", {
			FillDirection = Enum.FillDirection.Horizontal,
			HorizontalAlignment = Enum.HorizontalAlignment.Center,
			VerticalAlignment = Enum.VerticalAlignment.Center,
			SortOrder = Enum.SortOrder.LayoutOrder,
			Padding = UDim.new(0, 20),
		}),
	})
	-- Shrink the whole row on small (phone) screens.
	local scale = UI.new("UIScale", { Parent = row })
	local camera = Workspace.CurrentCamera
	if camera then
		scale.Scale = math.clamp(camera.ViewportSize.X / 760, 0.45, 1)
	end

	for index, card in cards do
		local button = buildCard(index, card, row)
		table.insert(cardButtons, button)
		UI.pop(button, 0.3, 0.25 + index * 0.08)
	end

	local timerBack = UI.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.55, 170),
		Size = UDim2.new(0, 400, 0, 10),
		BackgroundColor3 = Color3.fromRGB(40, 42, 60),
		Parent = root,
	}, { UI.corner(5) })
	local timerFill = UI.new("Frame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(255, 210, 70),
		Parent = timerBack,
	}, { UI.corner(5) })
	local total = math.max(endsAt - Workspace:GetServerTimeNow(), 0.1)
	timerConnection = RunService.RenderStepped:Connect(function()
		local remaining = math.max(endsAt - Workspace:GetServerTimeNow(), 0)
		timerFill.Size = UDim2.fromScale(remaining / total, 1)
	end)

	if UserInputService.GamepadEnabled and cardButtons[1] then
		GuiService.SelectedObject = cardButtons[1]
	end
end

function DraftController.Start()
	Net.Event("DraftOffer").OnClientEvent:Connect(function(cards, endsAt)
		if type(cards) == "table" and type(endsAt) == "number" and #cards > 0 then
			open(cards, endsAt)
		end
	end)
	Net.Event("DraftClose").OnClientEvent:Connect(close)

	UserInputService.InputBegan:Connect(function(input, gameProcessed)
		if gameProcessed or not overlay then
			return
		end
		local keys = { [Enum.KeyCode.One] = 1, [Enum.KeyCode.Two] = 2, [Enum.KeyCode.Three] = 3 }
		local index = keys[input.KeyCode]
		if index then
			choose(index)
		end
	end)
end

return DraftController
