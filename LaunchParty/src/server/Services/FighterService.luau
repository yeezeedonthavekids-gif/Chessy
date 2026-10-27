-- Registry of every combatant (players, bots, lobby dummies) plus their match state.
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Config = require(Shared.Config)
local Cosmetics = require(Shared.Cosmetics)
local Movement = require(Shared.Movement)
local Net = require(Shared.Net)
local Perks = require(Shared.Perks)

local FighterService = {}

export type Fighter = {
	Id: string,
	Name: string,
	Player: Player?,
	IsBot: boolean,
	IsDummy: boolean,
	Model: Model?,
	Humanoid: Humanoid?,
	Root: BasePart?,
	Tag: BillboardGui?,
	Trail: Trail?,
	Highlight: Highlight?,
	ModelConnections: { RBXScriptConnection },

	Zone: string, -- "Lobby" | "Arena" | "None"
	Alive: boolean, -- still in the current round
	Frozen: boolean,
	Heat: number,
	Perks: { [string]: number },
	Stats: Perks.Stats,
	Points: number,
	KOs: number,
	LivesLeft: number,
	Crowned: boolean,
	InMatch: boolean,
	Placement: number,

	LastHitBy: any?,
	LastHitTime: number,
	TumbleUntil: number,
	VoidImmuneUntil: number,
	LastPunch: number,
	ChargeStart: number?,
	DashReady: { number },
	DashUntil: number,
	DashDir: Vector3,
	DashHits: { [any]: boolean },

	Level: number,
	TitleName: string,
	TrailTier: number,
	AnimPlayer: ((string) -> ())?,
	Brain: any?,
	Home: CFrame?,
}

local fighters: { [string]: Fighter } = {}
local knockbackRemote = Net.Event("Knockback")

function FighterService.New(id: string, name: string, options: { Player: Player?, IsBot: boolean?, IsDummy: boolean? }): Fighter
	local fighter: Fighter = {
		Id = id,
		Name = name,
		Player = options.Player,
		IsBot = options.IsBot == true,
		IsDummy = options.IsDummy == true,
		Model = nil,
		Humanoid = nil,
		Root = nil,
		Tag = nil,
		Trail = nil,
		Highlight = nil,
		ModelConnections = {},

		Zone = "None",
		Alive = false,
		Frozen = false,
		Heat = 0,
		Perks = {},
		Stats = Perks.Compute({}),
		Points = 0,
		KOs = 0,
		LivesLeft = 0,
		Crowned = false,
		InMatch = false,
		Placement = 0,

		LastHitBy = nil,
		LastHitTime = -math.huge,
		TumbleUntil = 0,
		VoidImmuneUntil = 0,
		LastPunch = -math.huge,
		ChargeStart = nil,
		DashReady = { 0 },
		DashUntil = 0,
		DashDir = Vector3.zero,
		DashHits = {},

		Level = 1,
		TitleName = "Rookie",
		TrailTier = 1,
		AnimPlayer = nil,
		Brain = nil,
		Home = nil,
	}
	fighters[id] = fighter
	return fighter
end

function FighterService.Get(id: string): Fighter?
	return fighters[id]
end

function FighterService.GetByPlayer(player: Player): Fighter?
	return fighters["P" .. player.UserId]
end

function FighterService.All(): { Fighter }
	local list = {}
	for _, fighter in fighters do
		table.insert(list, fighter)
	end
	return list
end

function FighterService.IsAlive(fighter: Fighter): boolean
	local model, humanoid, root = fighter.Model, fighter.Humanoid, fighter.Root
	return model ~= nil
		and model.Parent ~= nil
		and humanoid ~= nil
		and humanoid.Health > 0
		and root ~= nil
		and root.Parent ~= nil
end

-- Fighters still alive in the current round's arena.
function FighterService.AliveInArena(): { Fighter }
	local list = {}
	for _, fighter in fighters do
		if fighter.Alive and fighter.Zone == "Arena" and FighterService.IsAlive(fighter) then
			table.insert(list, fighter)
		end
	end
	return list
end

-- Cosmetic tag ---------------------------------------------------------------

local function createTag(fighter: Fighter, model: Model): BillboardGui
	local adornee = model:FindFirstChild("Head") or fighter.Root
	local gui = Instance.new("BillboardGui")
	gui.Name = "FighterTag"
	gui.Size = UDim2.fromOffset(220, 58)
	gui.StudsOffset = Vector3.new(0, 2.6, 0)
	gui.AlwaysOnTop = true
	gui.MaxDistance = 160
	gui.LightInfluence = 0
	gui.Adornee = adornee :: BasePart

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Name = "NameLabel"
	nameLabel.BackgroundTransparency = 1
	nameLabel.Size = UDim2.new(1, 0, 0.4, 0)
	nameLabel.Font = Enum.Font.GothamBold
	nameLabel.TextScaled = true
	nameLabel.TextColor3 = Color3.new(1, 1, 1)
	nameLabel.TextStrokeTransparency = 0.35
	nameLabel.Parent = gui

	local heatLabel = Instance.new("TextLabel")
	heatLabel.Name = "HeatLabel"
	heatLabel.BackgroundTransparency = 1
	heatLabel.Position = UDim2.new(0, 0, 0.4, 0)
	heatLabel.Size = UDim2.new(1, 0, 0.6, 0)
	heatLabel.Font = Enum.Font.FredokaOne
	heatLabel.TextScaled = true
	heatLabel.TextStrokeTransparency = 0.2
	heatLabel.Parent = gui

	gui.Parent = model
	return gui
end

local function createTrail(fighter: Fighter, root: BasePart): Trail
	local top = Instance.new("Attachment")
	top.Name = "TrailTop"
	top.Position = Vector3.new(0, 0.9, 0)
	top.Parent = root
	local bottom = Instance.new("Attachment")
	bottom.Name = "TrailBottom"
	bottom.Position = Vector3.new(0, -0.9, 0)
	bottom.Parent = root

	local trail = Instance.new("Trail")
	trail.Name = "LaunchTrail"
	trail.Attachment0 = top
	trail.Attachment1 = bottom
	trail.Lifetime = 0.3
	trail.MinLength = 0.1
	trail.FaceCamera = true
	trail.LightEmission = 0.6
	trail.Transparency = NumberSequence.new(0.25, 1)
	trail.WidthScale = NumberSequence.new(1, 0.2)
	trail.Color = Cosmetics.TrailFor(fighter.TrailTier)
	trail.Enabled = false
	trail.Parent = root
	return trail
end

function FighterService.RefreshTag(fighter: Fighter)
	local tag = fighter.Tag
	if not tag or not tag.Parent then
		return
	end
	local nameLabel = tag:FindFirstChild("NameLabel") :: TextLabel?
	local heatLabel = tag:FindFirstChild("HeatLabel") :: TextLabel?
	if nameLabel then
		local prefix = if fighter.Crowned then "👑 " else ""
		local suffix = if fighter.IsDummy then "" elseif fighter.IsBot then "  · BOT" else "  · " .. fighter.TitleName
		nameLabel.Text = prefix .. fighter.Name .. suffix
		nameLabel.TextColor3 = if fighter.Crowned then Color3.fromRGB(255, 220, 90) else Color3.new(1, 1, 1)
	end
	if heatLabel then
		heatLabel.Text = string.format("%d%%", math.floor(fighter.Heat))
		heatLabel.TextColor3 = Cosmetics.HeatColor(fighter.Heat)
	end
end

function FighterService.RefreshCosmetics(fighter: Fighter)
	if fighter.Trail then
		fighter.Trail.Color = Cosmetics.TrailFor(fighter.TrailTier)
	end
	FighterService.RefreshTag(fighter)
end

-- Model binding ----------------------------------------------------------------

function FighterService.UnbindModel(fighter: Fighter)
	for _, connection in fighter.ModelConnections do
		connection:Disconnect()
	end
	table.clear(fighter.ModelConnections)
	if fighter.Model then
		CollectionService:RemoveTag(fighter.Model, "Fighter")
	end
	fighter.Model = nil
	fighter.Humanoid = nil
	fighter.Root = nil
	fighter.Tag = nil
	fighter.Trail = nil
	fighter.Highlight = nil
	fighter.ChargeStart = nil
end

function FighterService.BindModel(fighter: Fighter, model: Model): boolean
	FighterService.UnbindModel(fighter)
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	local root = model:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not humanoid or not root then
		warn("[LaunchParty] Cannot bind fighter without Humanoid/HumanoidRootPart:", fighter.Name)
		return false
	end

	fighter.Model = model
	fighter.Humanoid = humanoid
	fighter.Root = root
	model:SetAttribute("FighterId", fighter.Id)
	model:SetAttribute("Heat", fighter.Heat)
	CollectionService:AddTag(model, "Fighter")
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	humanoid.BreakJointsOnDeath = false

	fighter.Tag = createTag(fighter, model)
	fighter.Trail = createTrail(fighter, root)
	FighterService.ApplyStats(fighter)
	FighterService.RefreshTag(fighter)

	table.insert(
		fighter.ModelConnections,
		model.AncestryChanged:Connect(function(_, parent)
			if parent == nil and fighter.Model == model then
				FighterService.UnbindModel(fighter)
			end
		end)
	)
	return true
end

-- Stats, heat & movement --------------------------------------------------------

function FighterService.RefreshMovement(fighter: Fighter)
	local humanoid = fighter.Humanoid
	if not humanoid or not humanoid.Parent then
		return
	end
	local walk = fighter.Stats.WalkSpeed
	if fighter.ChargeStart then
		walk *= Config.Combat.ChargeWalkMult
	end
	humanoid.UseJumpPower = true
	humanoid.WalkSpeed = if fighter.Frozen then 0 else walk
	humanoid.JumpPower = if fighter.Frozen then 0 else fighter.Stats.JumpPower
end

function FighterService.ApplyStats(fighter: Fighter)
	local stats = fighter.Stats
	while #fighter.DashReady < stats.DashCharges do
		table.insert(fighter.DashReady, 0)
	end
	while #fighter.DashReady > stats.DashCharges do
		table.remove(fighter.DashReady)
	end
	FighterService.RefreshMovement(fighter)

	local model = fighter.Model
	if model and model.Parent then
		local ok, current = pcall(function()
			return model:GetScale()
		end)
		if ok and math.abs(current - stats.Scale) > 0.01 then
			local scaled, err = pcall(function()
				model:ScaleTo(stats.Scale)
			end)
			if not scaled then
				warn("[LaunchParty] ScaleTo failed:", err)
			end
		end
	end

	local player = fighter.Player
	if player then
		player:SetAttribute("PunchCooldown", Config.Combat.PunchCooldown * stats.PunchCooldownMult)
		player:SetAttribute("DashCooldown", Config.Combat.DashCooldown * stats.DashCooldownMult)
		player:SetAttribute("DashCharges", stats.DashCharges)
		player:SetAttribute("ChargeSpeed", stats.ChargeSpeed)
	end
end

function FighterService.SetPerks(fighter: Fighter, owned: { [string]: number })
	fighter.Perks = owned
	fighter.Stats = Perks.Compute(owned)
	FighterService.ApplyStats(fighter)
end

function FighterService.AddPerk(fighter: Fighter, perkId: string): boolean
	local def = Perks.ById[perkId]
	if not def then
		return false
	end
	local stacks = fighter.Perks[perkId] or 0
	if stacks >= def.MaxStacks then
		return false
	end
	local owned = table.clone(fighter.Perks)
	owned[perkId] = stacks + 1
	FighterService.SetPerks(fighter, owned)
	return true
end

function FighterService.SetHeat(fighter: Fighter, heat: number)
	local cap = if fighter.Zone == "Lobby" then Config.Lobby.HeatCap else 999
	fighter.Heat = math.clamp(heat, 0, cap)
	if fighter.Model then
		fighter.Model:SetAttribute("Heat", fighter.Heat)
	end
	FighterService.RefreshTag(fighter)
end

function FighterService.AddHeat(fighter: Fighter, amount: number)
	FighterService.SetHeat(fighter, fighter.Heat + amount)
end

function FighterService.SetFrozen(fighter: Fighter, frozen: boolean)
	fighter.Frozen = frozen
	FighterService.RefreshMovement(fighter)
end

function FighterService.SetCharging(fighter: Fighter, charging: boolean)
	if charging then
		fighter.ChargeStart = os.clock()
		if fighter.Model and not fighter.Highlight then
			local highlight = Instance.new("Highlight")
			highlight.Name = "ChargeGlow"
			highlight.FillColor = Color3.fromRGB(255, 150, 40)
			highlight.OutlineColor = Color3.fromRGB(255, 230, 120)
			highlight.FillTransparency = 0.6
			highlight.OutlineTransparency = 0
			highlight.DepthMode = Enum.HighlightDepthMode.Occluded
			highlight.Parent = fighter.Model
			fighter.Highlight = highlight
		end
	else
		fighter.ChargeStart = nil
		if fighter.Highlight then
			fighter.Highlight:Destroy()
			fighter.Highlight = nil
		end
	end
	FighterService.RefreshMovement(fighter)
end

-- Physics owner applies the launch: the client for players, the server for bots.
function FighterService.ApplyKnockback(fighter: Fighter, velocity: Vector3, tumble: number)
	if not FighterService.IsAlive(fighter) then
		return
	end
	fighter.TumbleUntil = os.clock() + tumble
	fighter.DashUntil = 0
	if fighter.ChargeStart then
		FighterService.SetCharging(fighter, false)
	end
	if fighter.Player then
		knockbackRemote:FireClient(fighter.Player, velocity, tumble)
	else
		Movement.Knockback(fighter.Humanoid :: Humanoid, fighter.Root :: BasePart, velocity, tumble)
	end
end

function FighterService.Teleport(fighter: Fighter, cframe: CFrame)
	if not FighterService.IsAlive(fighter) then
		return
	end
	(fighter.Model :: Model):PivotTo(cframe)
	FighterService.ApplyKnockback(fighter, Vector3.zero, 0)
end

-- Match lifecycle ---------------------------------------------------------------

function FighterService.ResetForMatch(fighter: Fighter)
	fighter.Points = 0
	fighter.KOs = 0
	fighter.Crowned = false
	fighter.Placement = 0
	fighter.LastHitBy = nil
	fighter.LivesLeft = 0
	FighterService.SetPerks(fighter, {})
	FighterService.SetHeat(fighter, 0)
end

function FighterService.ResetForRound(fighter: Fighter)
	fighter.Alive = false
	fighter.LastHitBy = nil
	fighter.LastHitTime = -math.huge
	fighter.TumbleUntil = 0
	fighter.VoidImmuneUntil = 0
	fighter.DashUntil = 0
	fighter.LivesLeft = fighter.Stats.ExtraLives
	for i in fighter.DashReady do
		fighter.DashReady[i] = 0
	end
	FighterService.SetCharging(fighter, false)
	FighterService.SetHeat(fighter, 0)
end

function FighterService.Remove(fighter: Fighter)
	FighterService.UnbindModel(fighter)
	fighters[fighter.Id] = nil
end

return FighterService
