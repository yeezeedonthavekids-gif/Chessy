-- The whole heads-up display, built in code.
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local SocialService = game:GetService("SocialService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Cosmetics = require(Shared:WaitForChild("Cosmetics"))
local Net = require(Shared:WaitForChild("Net"))

local ShopController = require(script.Parent.ShopController)
local State = require(script.Parent.State)
local TutorialController = require(script.Parent.TutorialController)
local UI = require(script.Parent.UI)

local HUDController = {}

local player = Players.LocalPlayer
local gameState = Net.GameState()

local gui: ScreenGui
local refs: { [string]: any } = {}
local lastHeat = 0
local announceToken = 0

local STATE_TITLES = {
	Waiting = "WAITING FOR PLAYERS",
	Intermission = "STARTING SOON",
	Countdown = "GET READY",
	Live = "FIGHT!",
	RoundEnd = "ROUND OVER",
	Draft = "PICK A PERK",
	MatchEnd = "MATCH OVER",
}

-- Construction ------------------------------------------------------------------------------

local function buildTopBar()
	local bar = UI.new("Frame", {
		Name = "TopBar",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 8),
		Size = UDim2.new(0.6, 0, 0, 66),
		BackgroundColor3 = UI.Panel,
		BackgroundTransparency = 0.2,
		Parent = gui,
	}, {
		UI.corner(14),
		UI.stroke(Color3.fromRGB(255, 205, 60), 2, 0.3),
		UI.gradient(Color3.fromRGB(34, 36, 52), Color3.fromRGB(22, 24, 36)),
	})
	UI.new("UISizeConstraint", { MinSize = Vector2.new(300, 66), MaxSize = Vector2.new(480, 66), Parent = bar })

	refs.StateLabel = UI.label({
		Name = "State",
		Position = UDim2.new(0, 16, 0, 6),
		Size = UDim2.new(0.72, -16, 0, 30),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(255, 210, 70),
		Text = "LAUNCH PARTY",
		Parent = bar,
	})
	refs.InfoLabel = UI.label({
		Name = "Info",
		Position = UDim2.new(0, 16, 0, 38),
		Size = UDim2.new(0.72, -16, 0, 20),
		TextXAlignment = Enum.TextXAlignment.Left,
		Font = UI.BodyFont,
		TextColor3 = Color3.fromRGB(220, 225, 240),
		Text = "",
		Parent = bar,
	})
	refs.TimerLabel = UI.label({
		Name = "Timer",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -16, 0.5, 0),
		Size = UDim2.new(0.26, 0, 0, 44),
		TextXAlignment = Enum.TextXAlignment.Right,
		Text = "",
		Parent = bar,
	})
end

local function buildHeatPanel()
	local panel = UI.new("Frame", {
		Name = "HeatPanel",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -18),
		Size = UDim2.new(0, 260, 0, 120),
		BackgroundTransparency = 1,
		Parent = gui,
	})
	refs.HeatLabel = UI.label({
		Name = "Heat",
		Size = UDim2.new(1, 0, 0, 70),
		Text = "0%",
		Parent = panel,
	})
	UI.textStroke(3).Parent = refs.HeatLabel
	UI.label({
		Name = "Caption",
		Position = UDim2.new(0, 0, 0, 66),
		Size = UDim2.new(1, 0, 0, 16),
		Font = UI.BodyFont,
		TextColor3 = Color3.fromRGB(210, 215, 230),
		Text = "HEAT",
		Parent = panel,
	})

	local pips = UI.new("Frame", {
		Name = "DashPips",
		Position = UDim2.new(0.5, 0, 0, 88),
		AnchorPoint = Vector2.new(0.5, 0),
		Size = UDim2.new(1, 0, 0, 10),
		BackgroundTransparency = 1,
		Parent = panel,
	}, {
		UI.new("UIListLayout", {
			FillDirection = Enum.FillDirection.Horizontal,
			HorizontalAlignment = Enum.HorizontalAlignment.Center,
			Padding = UDim.new(0, 6),
		}),
	})
	refs.DashPips = pips

	local chargeBack = UI.new("Frame", {
		Name = "Charge",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 104),
		Size = UDim2.new(0.8, 0, 0, 10),
		BackgroundColor3 = Color3.fromRGB(30, 30, 40),
		BackgroundTransparency = 0.2,
		Visible = false,
		Parent = panel,
	}, { UI.corner(5) })
	refs.ChargeBack = chargeBack
	refs.ChargeFill = UI.new("Frame", {
		Size = UDim2.new(0, 0, 1, 0),
		BackgroundColor3 = Color3.fromRGB(255, 170, 50),
		Parent = chargeBack,
	}, { UI.corner(5) })

	refs.ComboLabel = UI.label({
		Name = "Combo",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 0, -6),
		Size = UDim2.new(1, 0, 0, 34),
		TextColor3 = Color3.fromRGB(255, 220, 90),
		Text = "",
		Visible = false,
		Parent = panel,
	})
	UI.textStroke(2).Parent = refs.ComboLabel
end

local function buildScoreboard()
	local board = UI.new("Frame", {
		Name = "Scoreboard",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0, 90),
		Size = UDim2.new(0, 230, 0, 30),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = UI.Panel,
		BackgroundTransparency = 0.15,
		Parent = gui,
	}, {
		UI.corner(12),
		UI.gradient(Color3.fromRGB(34, 36, 52), Color3.fromRGB(22, 24, 36)),
		UI.new("UIPadding", {
			PaddingTop = UDim.new(0, 8),
			PaddingBottom = UDim.new(0, 8),
			PaddingLeft = UDim.new(0, 10),
			PaddingRight = UDim.new(0, 10),
		}),
		UI.new("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 3) }),
	})
	UI.label({
		Name = "Title",
		LayoutOrder = 0,
		Size = UDim2.new(1, 0, 0, 20),
		TextColor3 = Color3.fromRGB(255, 210, 70),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = "SCORES",
		Parent = board,
	})
	refs.Scoreboard = board
end

local function buildKillFeed()
	refs.KillFeed = UI.new("Frame", {
		Name = "KillFeed",
		Position = UDim2.new(0, 12, 0, 90),
		Size = UDim2.new(0, 320, 0, 120),
		BackgroundTransparency = 1,
		Parent = gui,
	}, {
		UI.new("UIListLayout", {
			SortOrder = Enum.SortOrder.LayoutOrder,
			Padding = UDim.new(0, 4),
		}),
	})
end

local function buildAnnouncement()
	refs.Announce = UI.label({
		Name = "Announce",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.32, 0),
		Size = UDim2.new(0.8, 0, 0, 96),
		Text = "",
		Visible = false,
		Parent = gui,
	})
	UI.new("UISizeConstraint", { MaxSize = Vector2.new(900, 96), Parent = refs.Announce })
	UI.textStroke(4).Parent = refs.Announce
	refs.AnnounceSub = UI.label({
		Name = "AnnounceSub",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0.32, 52),
		Size = UDim2.new(0.7, 0, 0, 30),
		Font = UI.BodyFont,
		Text = "",
		Visible = false,
		Parent = gui,
	})
	UI.new("UISizeConstraint", { MaxSize = Vector2.new(760, 30), Parent = refs.AnnounceSub })
	UI.textStroke(2).Parent = refs.AnnounceSub
end

local function buildProfile()
	local panel = UI.new("Frame", {
		Name = "Profile",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 12, 1, -12),
		Size = UDim2.new(0, 220, 0, 52),
		BackgroundColor3 = UI.Panel,
		BackgroundTransparency = 0.15,
		Parent = gui,
	}, { UI.corner(12), UI.gradient(Color3.fromRGB(34, 36, 52), Color3.fromRGB(22, 24, 36)) })
	refs.LevelLabel = UI.label({
		Position = UDim2.new(0, 10, 0, 6),
		Size = UDim2.new(1, -20, 0, 22),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = "LV 1 · Rookie",
		Parent = panel,
	})
	local barBack = UI.new("Frame", {
		Position = UDim2.new(0, 10, 0, 34),
		Size = UDim2.new(1, -20, 0, 8),
		BackgroundColor3 = Color3.fromRGB(45, 48, 66),
		Parent = panel,
	}, { UI.corner(4) })
	refs.XPFill = UI.new("Frame", {
		Size = UDim2.new(0, 0, 1, 0),
		BackgroundColor3 = Color3.fromRGB(140, 255, 90),
		Parent = barBack,
	}, { UI.corner(4) })

	local touch = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
	refs.Controls = UI.label({
		Name = "Controls",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 12, 1, -70),
		Size = UDim2.new(0, 300, 0, 18),
		Font = UI.BodyFont,
		TextColor3 = Color3.fromRGB(200, 205, 220),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextTransparency = 0.2,
		Text = if touch then "Tap PUNCH, hold it for a big one. DASH to dash." else "Click to punch, hold for a big one, Q or Shift to dash",
		Parent = gui,
	})

	-- Bonks counter + shop/help buttons on the left.
	local side = UI.new("Frame", {
		Name = "SideButtons",
		Position = UDim2.new(0, 12, 0, 222),
		Size = UDim2.new(0, 150, 0, 210),
		BackgroundTransparency = 1,
		Parent = gui,
	}, {
		UI.new("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 8) }),
	})
	local bonks = UI.new("Frame", {
		LayoutOrder = 1,
		Size = UDim2.new(1, 0, 0, 40),
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = side,
	}, { UI.corner(20), UI.gradient(Color3.fromRGB(255, 215, 70), Color3.fromRGB(255, 150, 30)) })
	refs.BonksLabel = UI.label({
		Size = UDim2.new(1, -16, 1, -8),
		Position = UDim2.new(0, 8, 0, 4),
		Text = "💰 0",
		Parent = bonks,
	})
	UI.textStroke(2).Parent = refs.BonksLabel

	local shop = UI.button("🛒 SHOP", Color3.fromRGB(255, 205, 80), Color3.fromRGB(230, 150, 40), {
		LayoutOrder = 2,
		Size = UDim2.new(1, 0, 0, 48),
		Parent = side,
	})
	shop.Activated:Connect(ShopController.Toggle)
	local help = UI.button("❓ HOW TO PLAY", Color3.fromRGB(60, 64, 86), Color3.fromRGB(40, 43, 60), {
		LayoutOrder = 3,
		Size = UDim2.new(1, 0, 0, 40),
		Parent = side,
	})
	help.Activated:Connect(function()
		TutorialController.Begin()
	end)
	local invite = UI.button("👋 INVITE", Color3.fromRGB(60, 64, 86), Color3.fromRGB(40, 43, 60), {
		LayoutOrder = 4,
		Size = UDim2.new(1, 0, 0, 40),
		Parent = side,
	})
	invite.Activated:Connect(function()
		local ok, canInvite = pcall(function()
			return SocialService:CanSendGameInviteAsync(player)
		end)
		if ok and canInvite then
			pcall(function()
				SocialService:PromptGameInvite(player)
			end)
		else
			State.BigMessage:Fire("Can't send invites here", "Small", "Invites only work in the live game.")
		end
	end)

	-- Daily quests.
	local quests = UI.new("Frame", {
		Name = "Quests",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 12, 1, -96),
		Size = UDim2.new(0, 250, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Color3.new(1, 1, 1),
		Parent = gui,
	}, {
		UI.corner(12),
		UI.gradient(Color3.fromRGB(34, 36, 52), Color3.fromRGB(22, 24, 36)),
		UI.new("UIPadding", {
			PaddingTop = UDim.new(0, 6),
			PaddingBottom = UDim.new(0, 8),
			PaddingLeft = UDim.new(0, 10),
			PaddingRight = UDim.new(0, 10),
		}),
		UI.new("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 4) }),
	})
	refs.QuestTitle = UI.label({
		LayoutOrder = 0,
		Size = UDim2.new(1, 0, 0, 18),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Color3.fromRGB(255, 205, 80),
		Text = "DAILY QUESTS",
		Parent = quests,
	})
	refs.Quests = quests
end

local function refreshQuests()
	local panel = refs.Quests
	for _, child in panel:GetChildren() do
		if child.Name == "Quest" then
			child:Destroy()
		end
	end
	local ok, list = pcall(function()
		return HttpService:JSONDecode(player:GetAttribute("Quests") or "[]")
	end)
	-- Short screens (phones in landscape) don't have room; quests still track in the background.
	local camera = Workspace.CurrentCamera
	local roomy = camera == nil or camera.ViewportSize.Y >= 600
	if not ok or type(list) ~= "table" or #list == 0 or not roomy then
		panel.Visible = false
		return
	end
	panel.Visible = true
	for index, quest in list do
		local row = UI.new("Frame", {
			Name = "Quest",
			LayoutOrder = index,
			Size = UDim2.new(1, 0, 0, 30),
			BackgroundTransparency = 1,
			Parent = panel,
		})
		UI.label({
			Size = UDim2.new(0.72, 0, 0, 16),
			Font = UI.BodyFont,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = if quest.Done then Color3.fromRGB(140, 220, 120) else Color3.new(1, 1, 1),
			Text = (if quest.Done then "✓ " else "") .. tostring(quest.Text),
			Parent = row,
		})
		UI.label({
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, 0, 0, 0),
			Size = UDim2.new(0.28, 0, 0, 16),
			Font = UI.BodyFont,
			TextXAlignment = Enum.TextXAlignment.Right,
			TextColor3 = Color3.fromRGB(255, 205, 80),
			Text = "💰" .. tostring(quest.Reward),
			Parent = row,
		})
		local back = UI.new("Frame", {
			Position = UDim2.new(0, 0, 0, 20),
			Size = UDim2.new(1, 0, 0, 6),
			BackgroundColor3 = Color3.fromRGB(50, 53, 70),
			Parent = row,
		}, { UI.corner(3) })
		UI.new("Frame", {
			Size = UDim2.new(math.clamp((quest.Progress or 0) / math.max(quest.Goal or 1, 1), 0, 1), 0, 1, 0),
			BackgroundColor3 = if quest.Done then Color3.fromRGB(110, 210, 110) else Color3.fromRGB(255, 205, 80),
			Parent = back,
		}, { UI.corner(3) })
	end
end

-- Updates -------------------------------------------------------------------------------------

local function refreshProfile()
	local level = player:GetAttribute("Level") or 1
	local title = player:GetAttribute("Title") or "Rookie"
	local into = player:GetAttribute("XPInto") or 0
	local needed = player:GetAttribute("XPNeeded") or 100
	refs.LevelLabel.Text = string.format("LV %d · %s", level, title)
	local bonks = player:GetAttribute("Bonks") or 0
	if refs.BonksLabel.Text ~= "💰 " .. bonks then
		refs.BonksLabel.Text = "💰 " .. bonks
		UI.pop(refs.BonksLabel, 1.2, 0.25)
	end
	UI.tween(refs.XPFill, 0.4, { Size = UDim2.new(math.clamp(into / math.max(needed, 1), 0, 1), 0, 1, 0) })
end

local function refreshScoreboard()
	local board = refs.Scoreboard
	for _, child in board:GetChildren() do
		if child:IsA("TextLabel") and child.Name == "Row" then
			child:Destroy()
		end
	end
	local raw = gameState:GetAttribute("Scoreboard")
	local ok, rows = pcall(function()
		return HttpService:JSONDecode(raw or "[]")
	end)
	if not ok or type(rows) ~= "table" or #rows == 0 then
		board.Visible = false
		return
	end
	board.Visible = true
	local myId = State.MyId()
	for index, row in rows do
		local crown = if row.Crown then "👑 " else ""
		local name = tostring(row.Name)
		if #name > 14 then
			name = string.sub(name, 1, 13) .. "..."
		end
		local label = UI.label({
			Name = "Row",
			LayoutOrder = index,
			Size = UDim2.new(1, 0, 0, 20),
			Font = UI.BodyFont,
			TextXAlignment = Enum.TextXAlignment.Left,
			RichText = true,
			TextColor3 = if row.Id == myId
				then Color3.fromRGB(120, 230, 255)
				elseif row.Alive then Color3.new(1, 1, 1)
				else Color3.fromRGB(140, 145, 160),
			Text = string.format('%s%s<font color="#FFD24A">  %d pts</font>  <font color="#9AA0B4">%d KO</font>', crown, name, row.Points or 0, row.KOs or 0),
			Parent = board,
		})
		label.TextScaled = true
	end
end

local function refreshState()
	local stateName = gameState:GetAttribute("State") or "Waiting"
	local round = gameState:GetAttribute("Round") or 0
	local maxRounds = gameState:GetAttribute("MaxRounds") or Config.Match.RoundsPerMatch
	local eventName = gameState:GetAttribute("Event") or ""
	local arenaName = gameState:GetAttribute("Arena") or ""

	if (stateName == "Live" or stateName == "Countdown" or stateName == "RoundEnd") and round > 0 then
		local suffix = if gameState:GetAttribute("SuddenDeath") then " · SUDDEN DEATH" else ""
		refs.StateLabel.Text = string.format("ROUND %d / %d%s", round, maxRounds, suffix)
		refs.InfoLabel.Text = string.format("%s · %s", eventName, arenaName)
	elseif stateName == "Draft" then
		refs.StateLabel.Text = STATE_TITLES.Draft
		refs.InfoLabel.Text = string.format("Round %d of %d is next", round + 1, maxRounds)
	elseif stateName == "MatchEnd" then
		refs.StateLabel.Text = STATE_TITLES.MatchEnd
		refs.InfoLabel.Text = "Champion: " .. tostring(gameState:GetAttribute("Champion") or "?")
	else
		refs.StateLabel.Text = STATE_TITLES[stateName] or stateName
		refs.InfoLabel.Text = if stateName == "Waiting"
			then "Go punch the dummies while you wait"
			else "Not enough people? Bots will join in."
	end
end

local function updateDashPips()
	local charges = player:GetAttribute("DashCharges") or 1
	local pips = refs.DashPips
	local existing = {}
	for _, child in pips:GetChildren() do
		if child:IsA("Frame") then
			table.insert(existing, child)
		end
	end
	while #existing < charges do
		local pip = UI.new("Frame", {
			Size = UDim2.new(0, 34, 0, 8),
			BackgroundColor3 = Color3.fromRGB(90, 220, 255),
			Parent = pips,
		}, { UI.corner(4) })
		table.insert(existing, pip)
	end
	while #existing > charges do
		table.remove(existing):Destroy()
	end
	local now = os.clock()
	for index, pip in existing do
		local ready = (State.DashReady[index] or 0) <= now
		pip.BackgroundColor3 = if ready then Color3.fromRGB(90, 220, 255) else Color3.fromRGB(60, 64, 84)
	end
end

local function renderStep()
	-- Timer
	local endsAt = gameState:GetAttribute("EndsAt") or 0
	if endsAt > 0 then
		local remaining = endsAt - Workspace:GetServerTimeNow()
		refs.TimerLabel.Text = UI.formatTime(remaining)
		local live = gameState:GetAttribute("State") == "Live"
		refs.TimerLabel.TextColor3 = if live and remaining <= 10 then Color3.fromRGB(255, 90, 80) else Color3.new(1, 1, 1)
	else
		refs.TimerLabel.Text = ""
	end

	-- Heat
	local character = player.Character
	local heat = if character then character:GetAttribute("Heat") or 0 else 0
	refs.HeatLabel.Text = string.format("%d%%", math.floor(heat))
	refs.HeatLabel.TextColor3 = Cosmetics.HeatColor(heat)
	if heat > lastHeat + 0.5 then
		UI.pop(refs.HeatLabel, 1.25 + math.min((heat - lastHeat) / 40, 0.5), 0.3)
	end
	lastHeat = heat

	-- Charge bar
	if State.Charging then
		local chargeSpeed = player:GetAttribute("ChargeSpeed") or 1
		local alpha = math.clamp((os.clock() - State.ChargeStart) * chargeSpeed / Config.Combat.ChargeMaxTime, 0, 1)
		refs.ChargeBack.Visible = true
		refs.ChargeFill.Size = UDim2.new(alpha, 0, 1, 0)
		refs.ChargeFill.BackgroundColor3 = if alpha >= 1
			then Color3.fromRGB(255, 70, 50)
			elseif alpha >= Config.Combat.ChargeThreshold then Color3.fromRGB(255, 170, 50)
			else Color3.fromRGB(200, 200, 210)
	else
		refs.ChargeBack.Visible = false
	end

	updateDashPips()

	local resetAt = player:GetAttribute("QuestsResetAt")
	if type(resetAt) == "number" then
		local hours = math.max(0, resetAt - os.time()) / 3600
		refs.QuestTitle.Text = if hours >= 1
			then string.format("DAILY QUESTS  ·  new in %dh", math.floor(hours))
			else string.format("DAILY QUESTS  ·  new in %dm", math.ceil(hours * 60))
	end

	if refs.ComboLabel.Visible and os.clock() - State.LastComboHit > 1.6 then
		refs.ComboLabel.Visible = false
	end
end

-- Messages -------------------------------------------------------------------------------------

function HUDController.Announce(text: string, style: string?, subtitle: string?)
	announceToken += 1
	local token = announceToken
	local label, sub = refs.Announce, refs.AnnounceSub
	style = style or "Big"

	label.Text = text
	label.Visible = true
	label.TextTransparency = 0
	label.Size = UDim2.new(0.8, 0, 0, if style == "Small" then 56 elseif style == "Count" then 120 else 96)
	label.TextColor3 = if style == "Event"
		then Color3.fromRGB(255, 120, 80)
		elseif style == "Count" then Color3.fromRGB(255, 220, 90)
		else Color3.new(1, 1, 1)
	UI.pop(label, if style == "Count" then 1.8 else 1.4, 0.3)

	sub.Text = subtitle or ""
	sub.Visible = subtitle ~= nil and subtitle ~= ""
	sub.TextTransparency = 0

	local hold = if style == "Count" then 0.75 elseif style == "Small" then 1.6 else 2.2
	task.delay(hold, function()
		if token ~= announceToken then
			return
		end
		UI.tween(label, 0.3, { TextTransparency = 1 })
		UI.tween(sub, 0.3, { TextTransparency = 1 })
		task.wait(0.3)
		if token == announceToken then
			label.Visible = false
			sub.Visible = false
		end
	end)
end

local feedCount = 0
function HUDController.Feed(text: string, color: Color3?)
	feedCount += 1
	local entry = UI.label({
		LayoutOrder = feedCount,
		Size = UDim2.new(1, 0, 0, 24),
		Font = UI.BodyFont,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = color or Color3.new(1, 1, 1),
		BackgroundColor3 = UI.Panel,
		BackgroundTransparency = 0.35,
		Text = "  " .. text,
		Parent = refs.KillFeed,
	})
	UI.corner(8).Parent = entry
	UI.pop(entry, 1.15, 0.2)
	local entries = {}
	for _, child in refs.KillFeed:GetChildren() do
		if child:IsA("TextLabel") then
			table.insert(entries, child)
		end
	end
	table.sort(entries, function(a, b)
		return a.LayoutOrder < b.LayoutOrder
	end)
	while #entries > 4 do
		table.remove(entries, 1):Destroy()
	end
	task.delay(6, function()
		if entry.Parent then
			UI.tween(entry, 0.4, { TextTransparency = 1, BackgroundTransparency = 1 })
			task.wait(0.4)
			entry:Destroy()
		end
	end)
end

local function onKillFeed(data)
	if type(data) ~= "table" then
		return
	end
	if data.Text then
		HUDController.Feed(tostring(data.Text), Color3.fromRGB(255, 220, 120))
		return
	end
	local myId = State.MyId()
	local victim = tostring(data.Victim)
	if data.Killer then
		local killer = tostring(data.Killer)
		local bounty = if data.Bounty then "  👑 BOUNTY!" else ""
		HUDController.Feed(string.format("💥 %s launched %s%s", killer, victim, bounty))
		if data.KillerId == myId then
			HUDController.Announce("KO!", "Big", if data.Bounty then "You took out the leader! +1 bonus point" else "You launched " .. victim)
		end
	else
		HUDController.Feed(string.format("🕳️ %s fell off", victim), Color3.fromRGB(200, 205, 220))
	end
	if data.VictimId == myId then
		HUDController.Announce("LAUNCHED!", "Event", if data.Killer then "by " .. tostring(data.Killer) else "Oops. Watch your step.")
	end
end

-- Match results ---------------------------------------------------------------------------------

local function showResults(data)
	if type(data) ~= "table" then
		return
	end
	if refs.Results then
		refs.Results:Destroy()
	end
	local panel = UI.new("Frame", {
		Name = "Results",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.55, 0),
		Size = UDim2.new(0, 420, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = UI.Panel,
		BackgroundTransparency = 0.08,
		Parent = gui,
	}, {
		UI.corner(16),
		UI.stroke(Color3.fromRGB(255, 205, 60), 3),
		UI.new("UIPadding", {
			PaddingTop = UDim.new(0, 14),
			PaddingBottom = UDim.new(0, 14),
			PaddingLeft = UDim.new(0, 18),
			PaddingRight = UDim.new(0, 18),
		}),
		UI.new("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder, Padding = UDim.new(0, 6) }),
	})
	refs.Results = panel

	local order = 0
	local function line(text: string, height: number, color: Color3?, font: Enum.Font?)
		order += 1
		UI.label({
			LayoutOrder = order,
			Size = UDim2.new(1, 0, 0, height),
			Text = text,
			TextColor3 = color or Color3.new(1, 1, 1),
			Font = font or UI.Font,
			Parent = panel,
		})
	end

	local placement = data.Placement or 0
	local ordinal = ({ "1st", "2nd", "3rd" })[placement] or (tostring(placement) .. "th")
	line(if placement == 1 then "🏆 YOU WON! 🏆" else "You got " .. ordinal, 40, Color3.fromRGB(255, 210, 70))
	line(string.format("%d points · %d KOs", data.Points or 0, data.KOs or 0), 22, nil, UI.BodyFont)
	local medals = { "🥇", "🥈", "🥉" }
	for index, entry in data.Podium or {} do
		line(string.format("%s %s  %d pts", medals[index] or "", tostring(entry.Name), entry.Points or 0), 22, nil, UI.BodyFont)
	end

	local rewards = data.Rewards
	if type(rewards) == "table" then
		line(string.format("+%d XP    +%d Bonks", rewards.XP or 0, rewards.Bonks or 0), 34, Color3.fromRGB(140, 255, 90))
		for _, text in rewards.Breakdown or {} do
			line(tostring(text), 18, Color3.fromRGB(190, 195, 210), UI.BodyFont)
		end
		if (rewards.NewLevel or 0) > (rewards.OldLevel or 0) then
			line(string.format("LEVEL UP!  %d → %d", rewards.OldLevel, rewards.NewLevel), 32, Color3.fromRGB(90, 230, 255))
		end
		for _, unlock in rewards.Unlocks or {} do
			line("🔓 " .. tostring(unlock), 22, Color3.fromRGB(255, 184, 40), UI.BodyFont)
		end
		if rewards.Persistent == false then
			line("(Progress doesn't save in this test session)", 16, Color3.fromRGB(160, 160, 170), UI.BodyFont)
		end
	end

	UI.pop(panel, 0.6, 0.4)
	task.delay(Config.Match.MatchEndTime + 1, function()
		if refs.Results == panel then
			panel:Destroy()
			refs.Results = nil
		end
	end)
end

-- Lifecycle -------------------------------------------------------------------------------------

function HUDController.Start()
	pcall(function()
		StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
	end)

	gui = UI.new("ScreenGui", {
		Name = "LaunchPartyHUD",
		ResetOnSpawn = false,
		IgnoreGuiInset = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		Parent = player:WaitForChild("PlayerGui"),
	})
	buildTopBar()
	buildHeatPanel()
	buildScoreboard()
	buildKillFeed()
	buildAnnouncement()
	buildProfile()

	refreshState()
	refreshScoreboard()
	refreshProfile()
	refreshQuests()
	player:GetAttributeChangedSignal("Quests"):Connect(refreshQuests)

	-- Our own heat is on the HUD, so hide the floating tag above our head.
	local function hideOwnTag(character: Model)
		local tag = character:WaitForChild("FighterTag", 15)
		if tag and tag:IsA("BillboardGui") then
			tag.Enabled = false
		end
	end
	player.CharacterAdded:Connect(hideOwnTag)
	if player.Character then
		task.spawn(hideOwnTag, player.Character)
	end

	gameState.AttributeChanged:Connect(function(attribute)
		if attribute == "Scoreboard" then
			refreshScoreboard()
		else
			refreshState()
		end
	end)
	for _, attribute in { "Level", "Title", "XPInto", "XPNeeded", "Bonks" } do
		player:GetAttributeChangedSignal(attribute):Connect(refreshProfile)
	end

	Net.Event("Announce").OnClientEvent:Connect(function(text, style, subtitle)
		if type(text) == "string" then
			HUDController.Announce(text, style, subtitle)
		end
	end)
	Net.Event("KillFeed").OnClientEvent:Connect(onKillFeed)
	Net.Event("MatchResults").OnClientEvent:Connect(showResults)

	State.BigMessage.Event:Connect(function(text, style, subtitle)
		HUDController.Announce(text, style, subtitle)
	end)
	State.ComboChanged.Event:Connect(function(combo)
		if combo >= 2 then
			refs.ComboLabel.Text = string.format("x%d COMBO!", combo)
			refs.ComboLabel.Visible = true
			UI.pop(refs.ComboLabel, 1.5, 0.25)
		end
	end)

	RunService.RenderStepped:Connect(function()
		local ok, err = pcall(renderStep)
		if not ok then
			warn("[LaunchParty] HUD error:", err)
		end
	end)
end

return HUDController
