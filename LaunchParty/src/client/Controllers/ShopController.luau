-- The shop window: skins and trails (Bonks), game passes, Bonks packs and bundles (Robux).
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared:WaitForChild("Net"))
local Shop = require(Shared:WaitForChild("Shop"))

local ProductInfo = require(script.Parent.ProductInfo)
local UI = require(script.Parent.UI)

local ShopController = {}

local player = Players.LocalPlayer
local actionRemote = Net.Event("ShopAction")

local gui: ScreenGui
local window: Frame
local content: ScrollingFrame
local bonksLabel: TextLabel
local tabButtons: { [string]: TextButton } = {}
local currentTab = "Skins"
local toastToken = 0

local TABS = { "Skins", "Trails", "Passes", "Bonks" }
local TAB_TITLES = { Skins = "Skins", Trails = "Trails", Passes = "Passes", Bonks = "Bonks & Bundles" }
local PASS_ICONS = { VIP = "⭐", DoubleXP = "⚡", Reroll = "🎲", RainbowTrail = "🌈" }

-- Ownership (mirrors the server's rules; the server double-checks everything) ---------------

local function inventory(): { [string]: { [string]: boolean } }
	local result = { Skins = {}, Trails = {}, Bundles = {} }
	local ok, decoded = pcall(function()
		return HttpService:JSONDecode(player:GetAttribute("Inventory") or "{}")
	end)
	if ok and type(decoded) == "table" then
		for kind, list in decoded do
			if result[kind] and type(list) == "table" then
				for _, id in list do
					result[kind][id] = true
				end
			end
		end
	end
	return result
end

local function owns(item: any, owned: { [string]: boolean }): boolean
	if item.Pass then
		return player:GetAttribute("Pass_" .. item.Pass) == true
	end
	if item.Price == 0 and not item.BundleOnly then
		return true
	end
	return owned[item.Id] == true
end

-- Cards --------------------------------------------------------------------------------------

local function card(order: number, accent: Color3): Frame
	return UI.new("Frame", {
		LayoutOrder = order,
		BackgroundColor3 = Color3.fromRGB(42, 44, 60),
		Parent = content,
	}, {
		UI.corner(14),
		UI.stroke(accent, 2, 0.2),
		UI.new("UIPadding", {
			PaddingTop = UDim.new(0, 8),
			PaddingBottom = UDim.new(0, 8),
			PaddingLeft = UDim.new(0, 8),
			PaddingRight = UDim.new(0, 8),
		}),
	})
end

local function swatch(parent: Frame, color: Color3?, sequence: ColorSequence?, icon: string?): Frame
	local frame = UI.new("Frame", {
		Size = UDim2.new(1, 0, 0, 62),
		BackgroundColor3 = color or Color3.new(1, 1, 1),
		Parent = parent,
	}, { UI.corner(10) })
	if sequence then
		UI.new("UIGradient", { Color = sequence, Parent = frame })
	elseif not color then
		UI.new("UIGradient", {
			Color = ColorSequence.new(Color3.fromRGB(255, 140, 200), Color3.fromRGB(120, 200, 255)),
			Parent = frame,
		})
	end
	if icon then
		local label = UI.label({ Name = "Emoji", Size = UDim2.fromScale(1, 1), Text = icon, Parent = frame })
		UI.textStroke(2).Parent = label
	end
	return frame
end

-- Swap the placeholder swatch for the real icon uploaded on the Roblox website, once it loads.
local function useRealIcon(frame: Frame, kind: string, id: number)
	ProductInfo.Get(kind, id, function(info)
		if not info.Icon or not frame.Parent then
			return
		end
		local emoji = frame:FindFirstChild("Emoji")
		if emoji then
			emoji:Destroy()
		end
		frame.BackgroundColor3 = Color3.fromRGB(20, 22, 34)
		local gradient = frame:FindFirstChildOfClass("UIGradient")
		if gradient then
			gradient:Destroy()
		end
		UI.new("ImageLabel", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.new(0, 60, 0, 60),
			BackgroundTransparency = 1,
			Image = info.Icon,
			ScaleType = Enum.ScaleType.Fit,
			Parent = frame,
		}, { UI.corner(10) })
	end)
end

-- Show the real Robux price from Roblox on the buy button.
local function useRealPrice(label: TextLabel, kind: string, id: number, suffix: string?)
	ProductInfo.Get(kind, id, function(info)
		if info.Price and label.Parent then
			label.Text = "R$ " .. info.Price .. (suffix or "")
		end
	end)
end

-- Labels showing the Starter Bundle countdown; refreshed once a second.
local timerLabels: { TextLabel } = {}

local function starterSecondsLeft(): number
	local endsAt = player:GetAttribute("StarterOfferEndsAt")
	if type(endsAt) ~= "number" or endsAt <= 0 then
		return 0
	end
	return math.max(0, endsAt - os.time())
end

local function textLines(parent: Frame, title: string, blurb: string?)
	UI.label({
		Position = UDim2.new(0, 0, 0, 66),
		Size = UDim2.new(1, 0, 0, 22),
		Text = title,
		Parent = parent,
	})
	UI.label({
		Position = UDim2.new(0, 0, 0, 88),
		Size = UDim2.new(1, 0, 0, 44),
		Font = UI.BodyFont,
		TextScaled = false,
		TextSize = 12,
		TextWrapped = true,
		TextYAlignment = Enum.TextYAlignment.Top,
		TextColor3 = Color3.fromRGB(205, 205, 225),
		Text = blurb or "",
		Parent = parent,
	})
end

local function actionButton(parent: Frame, text: string, top: Color3, bottom: Color3, onClick: (() -> ())?): TextLabel
	local button, label = UI.button(text, top, bottom, {
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 0, 1, 0),
		Size = UDim2.new(1, 0, 0, 32),
		Parent = parent,
	})
	if onClick then
		button.Activated:Connect(onClick)
	else
		button.Active = false
		button.AutoButtonColor = false
	end
	return label
end

local GREEN = { Color3.fromRGB(110, 230, 120), Color3.fromRGB(40, 170, 90) }
local GOLD = { Color3.fromRGB(255, 215, 70), Color3.fromRGB(255, 150, 30) }
local GREY = { Color3.fromRGB(120, 120, 140), Color3.fromRGB(80, 80, 100) }
local ROBUX = { Color3.fromRGB(90, 220, 140), Color3.fromRGB(20, 160, 110) }
local PINK = { Color3.fromRGB(255, 120, 190), Color3.fromRGB(230, 60, 120) }

local function cosmeticCards(list: { any }, kind: string)
	local owned = inventory()[kind]
	local equipped = player:GetAttribute(if kind == "Skins" then "EquippedSkin" else "EquippedTrail")
	local verb = if kind == "Skins" then "Skin" else "Trail"
	for order, item in list do
		local frame = card(order, if item.Pass or item.BundleOnly then GOLD[1] else Color3.fromRGB(90, 94, 116))
		if kind == "Skins" then
			swatch(frame, item.Color, nil, if item.Color then nil else "🙂")
		else
			swatch(frame, nil, item.Colors or ColorSequence.new(Color3.new(1, 1, 1), Color3.fromRGB(90, 230, 255)))
		end
		textLines(frame, item.Name, item.Blurb)

		if item.Id == equipped then
			actionButton(frame, "Equipped ✓", GREY[1], GREY[2], nil)
		elseif owns(item, owned) then
			actionButton(frame, "Equip", GREEN[1], GREEN[2], function()
				actionRemote:FireServer("Equip" .. verb, item.Id)
			end)
		elseif item.Pass then
			actionButton(frame, "Get the pass", PINK[1], PINK[2], function()
				actionRemote:FireServer("Prompt", item.Pass)
			end)
		elseif item.BundleOnly then
			actionButton(frame, "In a bundle", PINK[1], PINK[2], function()
				ShopController.ShowTab("Bonks")
			end)
		else
			actionButton(frame, "💰 " .. item.Price, GOLD[1], GOLD[2], function()
				actionRemote:FireServer("Buy" .. verb, item.Id)
			end)
		end
	end
end

local function robuxLabel(item: any): string
	if item.Id == 0 then
		return "Coming soon"
	end
	return "R$ " .. tostring(item.Robux or "?")
end

local function passCards()
	for order, pass in Shop.Passes do
		local frame = card(order, GOLD[1])
		local art = swatch(frame, Color3.fromRGB(255, 190, 60), nil, PASS_ICONS[pass.Key] or "🎟️")
		useRealIcon(art, "Pass", pass.Id)
		textLines(frame, pass.Name, pass.Blurb)
		if player:GetAttribute("Pass_" .. pass.Key) then
			actionButton(frame, "Owned ✓", GREY[1], GREY[2], nil)
		else
			local label = actionButton(frame, robuxLabel(pass), ROBUX[1], ROBUX[2], function()
				actionRemote:FireServer("Prompt", pass.Key)
			end)
			useRealPrice(label, "Pass", pass.Id)
		end
	end
end

local function productCards()
	local bundlesOwned = inventory().Bundles
	local order = 0
	for _, bundle in Shop.Bundles do
		order += 1
		local frame = card(order, PINK[1])
		local art = swatch(frame, Color3.fromRGB(255, 120, 190), nil, "🎁")
		useRealIcon(art, "Product", bundle.Id)
		textLines(frame, bundle.Name, bundle.Blurb)
		local isStarter = bundle.Key == "StarterBundle"
		if bundlesOwned[bundle.Key] then
			actionButton(frame, "Owned ✓", GREY[1], GREY[2], nil)
		elseif isStarter and starterSecondsLeft() <= 0 then
			actionButton(frame, "Offer ended", GREY[1], GREY[2], nil)
		else
			local label = actionButton(frame, robuxLabel(bundle), ROBUX[1], ROBUX[2], function()
				actionRemote:FireServer("Prompt", bundle.Key)
			end)
			useRealPrice(label, "Product", bundle.Id)
			if isStarter then
				-- Countdown sits on the image so it's the first thing you see.
				local timer = UI.label({
					AnchorPoint = Vector2.new(0.5, 1),
					Position = UDim2.new(0.5, 0, 0, 60),
					Size = UDim2.new(1, -8, 0, 18),
					Font = UI.BodyFont,
					TextColor3 = Color3.fromRGB(255, 225, 120),
					Text = "⏰ " .. ProductInfo.FormatTime(starterSecondsLeft()),
					ZIndex = 3,
					Parent = art,
				})
				UI.textStroke(1.5).Parent = timer
				table.insert(timerLabels, timer)
			end
		end
	end
	for _, product in Shop.Products do
		order += 1
		local frame = card(order, GOLD[1])
		local art = swatch(frame, Color3.fromRGB(255, 205, 60), nil, "💰 " .. product.Bonks)
		useRealIcon(art, "Product", product.Id)
		textLines(frame, product.Name, string.format("%d Bonks to spend on skins and trails.", product.Bonks))
		local label = actionButton(frame, robuxLabel(product), ROBUX[1], ROBUX[2], function()
			actionRemote:FireServer("Prompt", product.Key)
		end)
		useRealPrice(label, "Product", product.Id)
	end
end

local function refresh()
	if not window or not window.Visible then
		return
	end
	bonksLabel.Text = "💰 " .. tostring(player:GetAttribute("Bonks") or 0)
	for _, child in content:GetChildren() do
		if child:IsA("Frame") then
			child:Destroy()
		end
	end
	for name, button in tabButtons do
		local label = button:FindFirstChild("Label") :: TextLabel?
		if label then
			label.TextColor3 = if name == currentTab then Color3.fromRGB(255, 230, 120) else Color3.new(1, 1, 1)
		end
	end
	if currentTab == "Skins" then
		cosmeticCards(Shop.Skins, "Skins")
	elseif currentTab == "Trails" then
		cosmeticCards(Shop.Trails, "Trails")
	elseif currentTab == "Passes" then
		passCards()
	else
		productCards()
	end
end

function ShopController.ShowTab(tab: string)
	currentTab = tab
	content.CanvasPosition = Vector2.zero
	refresh()
end

-- Window ---------------------------------------------------------------------------------------

local function build()
	gui = UI.new("ScreenGui", {
		Name = "LaunchPartyShop",
		ResetOnSpawn = false,
		DisplayOrder = 5,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		Parent = player:WaitForChild("PlayerGui"),
	})

	window = UI.new("Frame", {
		Name = "Window",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.52),
		Size = UDim2.new(0, 700, 0, 470),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Visible = false,
		Parent = gui,
	}, {
		UI.corner(18),
		UI.gradient(Color3.fromRGB(34, 36, 52), Color3.fromRGB(22, 24, 36)),
		UI.stroke(Color3.fromRGB(255, 210, 80), 3),
	})
	local scale = UI.new("UIScale", { Parent = window })
	local camera = Workspace.CurrentCamera
	if camera then
		local function fit()
			local viewport = camera.ViewportSize
			scale.Scale = math.clamp(math.min(viewport.X / 760, viewport.Y / 540), 0.45, 1)
		end
		fit()
		camera:GetPropertyChangedSignal("ViewportSize"):Connect(fit)
	end

	local title = UI.label({
		Position = UDim2.new(0, 20, 0, 10),
		Size = UDim2.new(0, 200, 0, 44),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = "SHOP",
		TextColor3 = Color3.fromRGB(255, 220, 90),
		Parent = window,
	})
	UI.textStroke(3).Parent = title

	local pill = UI.new("Frame", {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -70, 0, 14),
		Size = UDim2.new(0, 150, 0, 36),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = window,
	}, { UI.corner(18), UI.gradient(GOLD[1], GOLD[2]) })
	bonksLabel = UI.label({ Size = UDim2.new(1, -12, 1, -6), Position = UDim2.new(0, 6, 0, 3), Text = "💰 0", Parent = pill })
	UI.textStroke(2).Parent = bonksLabel

	local close = UI.button("X", Color3.fromRGB(255, 100, 100), Color3.fromRGB(200, 40, 60), {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -14, 0, 12),
		Size = UDim2.new(0, 42, 0, 40),
		Parent = window,
	})
	close.Activated:Connect(function()
		window.Visible = false
	end)

	local tabs = UI.new("Frame", {
		Position = UDim2.new(0, 20, 0, 62),
		Size = UDim2.new(1, -40, 0, 40),
		BackgroundTransparency = 1,
		Parent = window,
	}, {
		UI.new("UIListLayout", {
			FillDirection = Enum.FillDirection.Horizontal,
			SortOrder = Enum.SortOrder.LayoutOrder,
			Padding = UDim.new(0, 10),
		}),
	})
	local tabColors = {
		Skins = { Color3.fromRGB(60, 64, 86), Color3.fromRGB(44, 47, 64) },
		Trails = { Color3.fromRGB(60, 64, 86), Color3.fromRGB(44, 47, 64) },
		Passes = { Color3.fromRGB(60, 64, 86), Color3.fromRGB(44, 47, 64) },
		Bonks = { Color3.fromRGB(60, 64, 86), Color3.fromRGB(44, 47, 64) },
	}
	for index, tab in TABS do
		local button = UI.button(TAB_TITLES[tab], tabColors[tab][1], tabColors[tab][2], {
			LayoutOrder = index,
			Size = UDim2.new(0.25, -8, 1, 0),
			Parent = tabs,
		})
		button.Activated:Connect(function()
			ShopController.ShowTab(tab)
		end)
		tabButtons[tab] = button
	end

	content = UI.new("ScrollingFrame", {
		Position = UDim2.new(0, 20, 0, 114),
		Size = UDim2.new(1, -40, 1, -130),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 8,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		Parent = window,
	}, {
		UI.new("UIGridLayout", {
			CellSize = UDim2.new(0, 152, 0, 180),
			CellPadding = UDim2.new(0, 12, 0, 12),
			SortOrder = Enum.SortOrder.LayoutOrder,
		}),
	})
end

function ShopController.Toggle()
	window.Visible = not window.Visible
	if window.Visible then
		UI.pop(window, 0.85, 0.25)
		refresh()
	end
end

-- Toasts for purchase results ---------------------------------------------------------------------

function ShopController.Toast(ok: boolean, message: string)
	toastToken += 1
	local token = toastToken
	local existing = gui:FindFirstChild("Toast")
	if existing then
		existing:Destroy()
	end
	local toast = UI.new("Frame", {
		Name = "Toast",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 84),
		Size = UDim2.new(0, 420, 0, 44),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = gui,
	}, {
		UI.corner(22),
		if ok
			then UI.gradient(Color3.fromRGB(110, 230, 120), Color3.fromRGB(40, 170, 90))
			else UI.gradient(Color3.fromRGB(255, 120, 120), Color3.fromRGB(210, 50, 70)),
	})
	local label = UI.label({
		Size = UDim2.new(1, -20, 1, -10),
		Position = UDim2.new(0, 10, 0, 5),
		Font = UI.BodyFont,
		Text = message,
		Parent = toast,
	})
	UI.textStroke(1.5).Parent = label
	UI.pop(toast, 0.7, 0.25)
	task.delay(2.6, function()
		if token == toastToken and toast.Parent then
			UI.tween(toast, 0.3, { BackgroundTransparency = 1 })
			UI.tween(label, 0.3, { TextTransparency = 1 })
			task.wait(0.3)
			toast:Destroy()
		end
	end)
end

function ShopController.Start()
	build()
	Net.Event("ShopResult").OnClientEvent:Connect(function(ok, message)
		if type(message) == "string" then
			ShopController.Toast(ok == true, message)
		end
	end)
	task.spawn(function()
		while true do
			task.wait(1)
			local left = starterSecondsLeft()
			for i = #timerLabels, 1, -1 do
				local label = timerLabels[i]
				if label.Parent then
					label.Text = "⏰ " .. ProductInfo.FormatTime(left)
				else
					table.remove(timerLabels, i)
				end
			end
		end
	end)
	player.AttributeChanged:Connect(function(attribute)
		if attribute == "Bonks" or attribute == "Inventory" or string.sub(attribute, 1, 8) == "Equipped" or string.sub(attribute, 1, 5) == "Pass_" or attribute == "StarterOfferEndsAt" then
			refresh()
		end
	end)
end

return ShopController
