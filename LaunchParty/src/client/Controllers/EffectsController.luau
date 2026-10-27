-- Juice: applies knockback to our own character and renders every hit, blast and gust locally.
local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Movement = require(Shared:WaitForChild("Movement"))
local Net = require(Shared:WaitForChild("Net"))

local AnimationController = require(script.Parent.AnimationController)
local State = require(script.Parent.State)

local EffectsController = {}

local player = Players.LocalPlayer
local random = Random.new()
local fxFolder: Folder

local shakeIntensity = 0
local shakeDecay = 0

local function getCharacter(): (Model?, Humanoid?, BasePart?)
	local character = player.Character
	if not character then
		return nil, nil, nil
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not humanoid or not root or humanoid.Health <= 0 then
		return nil, nil, nil
	end
	return character, humanoid, root
end

local function fxPart(props: { [string]: any }): Part
	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.CastShadow = false
	part.Material = Enum.Material.Neon
	for key, value in props do
		(part :: any)[key] = value
	end
	part.Parent = fxFolder
	return part
end

function EffectsController.PlaySound(soundId: string?, position: Vector3?, volume: number?, pitch: number?)
	if not soundId or soundId == "" then
		return
	end
	local sound = Instance.new("Sound")
	sound.SoundId = soundId
	sound.Volume = volume or 0.6
	sound.PlaybackSpeed = pitch or random:NextNumber(0.92, 1.08)
	if position then
		local holder = Instance.new("Attachment")
		holder.WorldPosition = position
		holder.Parent = Workspace.Terrain
		sound.RollOffMaxDistance = 220
		sound.Parent = holder
		Debris:AddItem(holder, 4)
	else
		sound.Parent = SoundService
		Debris:AddItem(sound, 4)
	end
	sound:Play()
end

function EffectsController.Shake(intensity: number, duration: number)
	if intensity > shakeIntensity then
		shakeIntensity = intensity
		shakeDecay = intensity / math.max(duration, 0.05)
	end
end

function EffectsController.FovKick(amount: number)
	local camera = Workspace.CurrentCamera
	if not camera then
		return
	end
	local base = 70
	camera.FieldOfView = base + amount
	TweenService:Create(camera, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		FieldOfView = base,
	}):Play()
end

local function burst(position: Vector3, color: Color3, size: number, duration: number)
	local ball = fxPart({
		Shape = Enum.PartType.Ball,
		Size = Vector3.one,
		CFrame = CFrame.new(position),
		Color = color,
		Transparency = 0.15,
	})
	TweenService:Create(ball, TweenInfo.new(duration, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.one * size,
		Transparency = 1,
	}):Play()
	Debris:AddItem(ball, duration + 0.05)
end

local function ring(position: Vector3, color: Color3, radius: number, duration: number)
	local disc = fxPart({
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.3, 2, 2),
		CFrame = CFrame.new(position) * CFrame.Angles(0, 0, math.rad(90)),
		Color = color,
		Transparency = 0.2,
	})
	TweenService:Create(disc, TweenInfo.new(duration, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
		Size = Vector3.new(0.3, radius * 2, radius * 2),
		Transparency = 1,
	}):Play()
	Debris:AddItem(disc, duration + 0.05)
end

local function shards(position: Vector3, color: Color3, count: number, speed: number)
	for _ = 1, count do
		local shard = fxPart({
			Anchored = false,
			Size = Vector3.one * random:NextNumber(0.3, 0.7),
			CFrame = CFrame.new(position) * CFrame.Angles(random:NextNumber(0, 6), random:NextNumber(0, 6), 0),
			Color = color,
		})
		shard.AssemblyLinearVelocity = random:NextUnitVector() * speed + Vector3.new(0, speed * 0.5, 0)
		Debris:AddItem(shard, 0.6)
	end
end

local function popupText(position: Vector3, text: string, color: Color3)
	local anchor = fxPart({ Size = Vector3.one * 0.2, Transparency = 1, CFrame = CFrame.new(position) })
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(110, 44)
	gui.StudsOffset = Vector3.new(random:NextNumber(-1, 1), 2.5, 0)
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.Parent = anchor
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.Text = text
	label.TextColor3 = color
	label.TextStrokeTransparency = 0
	label.Parent = gui
	TweenService:Create(gui, TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		StudsOffset = gui.StudsOffset + Vector3.new(0, 3, 0),
	}):Play()
	TweenService:Create(label, TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
		TextTransparency = 1,
		TextStrokeTransparency = 1,
	}):Play()
	Debris:AddItem(anchor, 0.85)
end

-- Effect handlers ------------------------------------------------------------------------

local handlers: { [string]: (any) -> () } = {}

function handlers.Hit(data)
	local position: Vector3 = data.Position
	local speed: number = data.Speed or 30
	local strength = math.clamp(speed / 160, 0.15, 1)
	local charged = data.Kind == "Charged" or data.Kind == "Shockwave"
	local color = if charged
		then Color3.fromRGB(255, 160, 50)
		elseif data.Kind == "Bump" then Color3.fromRGB(90, 220, 255)
		else Color3.new(1, 1, 1)
	burst(position, color, 3 + strength * 7, 0.25)
	shards(position, color, math.floor(4 + strength * 8), 25 + strength * 40)
	if data.Heat and data.Heat > 0 then
		popupText(position, "+" .. data.Heat .. "%", if charged then Color3.fromRGB(255, 170, 60) else Color3.new(1, 1, 1))
	end
	EffectsController.PlaySound(Config.Sounds.Hit, position, 0.5 + strength * 0.6, 1.25 - strength * 0.4)

	if data.Victim then
		AnimationController.PlayForFighter(data.Victim, "Flinch")
		local victimModel = AnimationController.ModelFor(data.Victim)
		if victimModel then
			-- White impact flash.
			local flash = Instance.new("Highlight")
			flash.FillColor = Color3.new(1, 1, 1)
			flash.OutlineColor = Color3.new(1, 1, 1)
			flash.FillTransparency = 0.15
			flash.OutlineTransparency = 0.3
			flash.DepthMode = Enum.HighlightDepthMode.Occluded
			flash.Parent = victimModel
			TweenService:Create(flash, TweenInfo.new(0.18), { FillTransparency = 1, OutlineTransparency = 1 }):Play()
			Debris:AddItem(flash, 0.2)
		end
	end
	if data.Attacker then
		-- The attacker freezes for the same split second the victim does.
		AnimationController.Hitstop(data.Attacker, Movement.HitstopFor(speed))
	end
	local myId = State.MyId()
	if data.Attacker == myId then
		EffectsController.Shake(0.25 + strength * 0.5, 0.18)
		if charged then
			EffectsController.FovKick(6 + strength * 6)
		end
		local now = os.clock()
		State.Combo = if now - State.LastComboHit < 1.6 then State.Combo + 1 else 1
		State.LastComboHit = now
		State.ComboChanged:Fire(State.Combo)
	elseif data.Victim == myId then
		EffectsController.Shake(0.4 + strength * 1.1, 0.3)
	end
end

function handlers.KO(data)
	local position: Vector3 = data.Position
	local beamHeight = 160
	local beam = fxPart({
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(beamHeight, 6, 6),
		CFrame = CFrame.new(position + Vector3.new(0, beamHeight / 2 - 10, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(255, 220, 90),
		Transparency = 0.1,
	})
	TweenService:Create(beam, TweenInfo.new(0.9, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.new(beamHeight, 0.2, 0.2),
		Transparency = 1,
	}):Play()
	Debris:AddItem(beam, 1)
	burst(position, Color3.fromRGB(255, 240, 160), 26, 0.5)
	ring(position, Color3.fromRGB(255, 200, 80), 30, 0.7)
	EffectsController.PlaySound(Config.Sounds.KO, position, 1, 1)
	EffectsController.Shake(0.5, 0.35)
end

function handlers.Meteor(data)
	local position: Vector3 = data.Position
	burst(position, Color3.fromRGB(255, 120, 40), (data.Radius or 10) * 2, 0.45)
	ring(position, Color3.fromRGB(255, 80, 40), (data.Radius or 10) * 1.4, 0.5)
	shards(position, Color3.fromRGB(90, 60, 45), 14, 60)
	EffectsController.PlaySound(Config.Sounds.Boom, position, 1.2, 0.6)
	local _, _, root = getCharacter()
	if root and (root.Position - position).Magnitude < 45 then
		EffectsController.Shake(0.8, 0.4)
	end
end

function handlers.Shockwave(data)
	ring(data.Position, Color3.fromRGB(255, 170, 60), data.Radius or 12, 0.4)
	burst(data.Position, Color3.fromRGB(255, 200, 120), 8, 0.3)
end

function handlers.Swing(data)
	if data.Fighter ~= State.MyId() then
		AnimationController.PlayForFighter(data.Fighter, if data.Charged then "Haymaker" else "Jab")
	end
end

function handlers.Dash(data)
	if data.Fighter == State.MyId() then
		return
	end
	AnimationController.PlayForFighter(data.Fighter, "Dash")
	ring(data.Position - Vector3.new(0, 2.5, 0), Color3.fromRGB(200, 240, 255), 4, 0.3)
end

function handlers.SecondWind(data)
	burst(data.Position, Color3.fromRGB(120, 255, 230), 14, 0.5)
	ring(data.Position, Color3.fromRGB(120, 255, 230), 12, 0.6)
end

local function windStreaks(direction: Vector3, center: Vector3, duration: number, transparency: number)
	local right = Vector3.new(-direction.Z, 0, direction.X)
	for _ = 1, 26 do
		local start = center
			- direction * 60
			+ right * random:NextNumber(-55, 55)
			+ Vector3.new(0, random:NextNumber(1, 12), 0)
		local streak = fxPart({
			Size = Vector3.new(0.25, 0.25, random:NextNumber(6, 14)),
			CFrame = CFrame.lookAt(start, start + direction),
			Color = Color3.new(1, 1, 1),
			Transparency = transparency,
		})
		TweenService:Create(streak, TweenInfo.new(duration * random:NextNumber(0.7, 1.2), Enum.EasingStyle.Linear), {
			CFrame = CFrame.lookAt(start + direction * 120, start + direction * 121),
			Transparency = 1,
		}):Play()
		Debris:AddItem(streak, duration * 1.3)
	end
end

function handlers.GustWarning(data)
	windStreaks(data.Direction, data.Center, 1.6, 0.8)
	State.BigMessage:Fire("💨 GUST INCOMING", "Small", "Brace yourself!")
end

function handlers.Gust(data)
	windStreaks(data.Direction, data.Center, 0.7, 0.3)
end

local CONFETTI = {
	Color3.fromRGB(255, 90, 120),
	Color3.fromRGB(255, 210, 60),
	Color3.fromRGB(90, 230, 140),
	Color3.fromRGB(80, 170, 255),
	Color3.fromRGB(200, 110, 255),
}

local function confetti(position: Vector3, amount: number)
	for _ = 1, amount do
		local piece = fxPart({
			Anchored = false,
			Material = Enum.Material.SmoothPlastic,
			Size = Vector3.new(0.6, 0.08, 0.35),
			CFrame = CFrame.new(position) * CFrame.Angles(random:NextNumber(0, 6), random:NextNumber(0, 6), 0),
			Color = CONFETTI[random:NextInteger(1, #CONFETTI)],
		})
		piece.AssemblyLinearVelocity = Vector3.new(random:NextNumber(-25, 25), random:NextNumber(35, 70), random:NextNumber(-25, 25))
		piece.AssemblyAngularVelocity = random:NextUnitVector() * 15
		Debris:AddItem(piece, 2.5)
	end
end

function handlers.RoundWin(data)
	AnimationController.PlayForFighter(data.Fighter, "Victory")
	if data.Position then
		confetti(data.Position + Vector3.new(0, 3, 0), 60)
	end
	if data.Fighter == State.MyId() then
		EffectsController.FovKick(-8)
	end
end

-- Lifecycle --------------------------------------------------------------------------------

function EffectsController.Start()
	fxFolder = Instance.new("Folder")
	fxFolder.Name = "ClientFX"
	fxFolder.Parent = Workspace

	Net.Event("Knockback").OnClientEvent:Connect(function(velocity, tumble)
		if typeof(velocity) ~= "Vector3" or type(tumble) ~= "number" then
			return
		end
		local _, humanoid, root = getCharacter()
		if not humanoid or not root then
			return
		end
		State.Charging = false
		if velocity.Magnitude > 0.5 then
			State.LastKnockback = os.clock()
		end
		local stop = if tumble > 0 and velocity.Magnitude > 1 then Movement.HitstopFor(velocity.Magnitude) else 0
		Movement.HitstopThenKnockback(humanoid, root, velocity, tumble, stop)
	end)

	Net.Event("Effect").OnClientEvent:Connect(function(kind, data)
		local handler = handlers[kind]
		if handler and type(data) == "table" then
			local ok, err = pcall(handler, data)
			if not ok then
				warn("[LaunchParty] Effect error:", kind, err)
			end
		end
	end)

	RunService.RenderStepped:Connect(function(dt)
		local _, humanoid = getCharacter()
		if shakeIntensity > 0 then
			shakeIntensity = math.max(0, shakeIntensity - shakeDecay * dt)
			if humanoid then
				humanoid.CameraOffset = random:NextUnitVector() * shakeIntensity * 0.6
			end
		elseif humanoid and humanoid.CameraOffset ~= Vector3.zero then
			humanoid.CameraOffset = Vector3.zero
		end
	end)
end

return EffectsController
