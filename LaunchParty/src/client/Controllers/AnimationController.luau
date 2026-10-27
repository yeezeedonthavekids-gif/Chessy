-- Animations. Punches (jab, wind-up, haymaker) use real animations from
-- ReplicatedStorage.LaunchPartyAnimations (see Config.Anims). If those aren't available, and for
-- dash / flinch / victory, this falls back to procedural animation. Instead of uploaded animation assets, we bend each R15 joint (Motor6D.C0)
-- in code: alternating jabs, a wind-up while charging, a haymaker, dash lean, hit flinch and a victory pose.
-- They layer on top of Roblox's walk/idle animations, and every client runs them for every fighter.
local CollectionService = game:GetService("CollectionService")
local KeyframeSequenceProvider = game:GetService("KeyframeSequenceProvider")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local State = require(script.Parent.State)

local AnimationController = {}

local player = Players.LocalPlayer
local random = Random.new()

-- Angles in degrees: { pitch (forward/back), yaw (twist), roll (out to the side) }
type Angles = { number }
type Pose = { [string]: Angles }

local JOINTS = {
	Waist = { "UpperTorso", "Waist" },
	Neck = { "Head", "Neck" },
	RightShoulder = { "RightUpperArm", "RightShoulder" },
	RightElbow = { "RightLowerArm", "RightElbow" },
	LeftShoulder = { "LeftUpperArm", "LeftShoulder" },
	LeftElbow = { "LeftLowerArm", "LeftElbow" },
}

local POSES: { [string]: Pose } = {
	JabRight = {
		RightShoulder = { 92, 10, 0 },
		RightElbow = { 5, 0, 0 },
		LeftShoulder = { 35, 0, 0 },
		LeftElbow = { 100, 0, 0 },
		Waist = { -4, 24, 0 },
		Neck = { 0, -12, 0 },
	},
	WindUp = {
		RightShoulder = { -35, 0, 20 },
		RightElbow = { 120, 0, 0 },
		LeftShoulder = { 70, -15, 0 },
		LeftElbow = { 25, 0, 0 },
		Waist = { -6, -38, 0 },
		Neck = { 0, 28, 0 },
	},
	Haymaker = {
		RightShoulder = { 100, 18, 0 },
		RightElbow = { 0, 0, 0 },
		LeftShoulder = { -35, 0, -15 },
		LeftElbow = { 50, 0, 0 },
		Waist = { -18, 42, 0 },
		Neck = { 8, -28, 0 },
	},
	Dash = {
		Waist = { -28, 0, 0 },
		Neck = { 18, 0, 0 },
		RightShoulder = { -60, 0, 12 },
		LeftShoulder = { -60, 0, -12 },
		RightElbow = { 25, 0, 0 },
		LeftElbow = { 25, 0, 0 },
	},
	Flinch = {
		Waist = { 20, 0, 0 },
		Neck = { 25, 0, 0 },
		RightShoulder = { -25, 0, 35 },
		LeftShoulder = { -25, 0, -35 },
		RightElbow = { 40, 0, 0 },
		LeftElbow = { 40, 0, 0 },
	},
	Victory = {
		RightShoulder = { 165, 0, 18 },
		LeftShoulder = { 165, 0, -18 },
		RightElbow = { 25, 0, 0 },
		LeftElbow = { 25, 0, 0 },
		Waist = { 10, 0, 0 },
		Neck = { 20, 0, 0 },
	},
}

-- Swap left and right (and flip twist/roll) so jabs can alternate hands.
local function mirror(pose: Pose): Pose
	local result = {}
	for joint, angles in pose do
		local target = joint
		if string.find(joint, "Right") then
			target = string.gsub(joint, "Right", "Left")
		elseif string.find(joint, "Left") then
			target = string.gsub(joint, "Left", "Right")
		end
		result[target] = { angles[1], -angles[2], -angles[3] }
	end
	return result
end
POSES.JabLeft = mirror(POSES.JabRight)

-- Timing: attack (ease in), hold, then release back to neutral.
local GESTURES = {
	Jab = { Duration = 0.3, Attack = 0.06, Hold = 0.06 },
	Haymaker = { Duration = 0.55, Attack = 0.07, Hold = 0.15 },
	Dash = { Duration = 0.4, Attack = 0.05, Hold = 0.18 },
	Flinch = { Duration = 0.4, Attack = 0.04, Hold = 0.06 },
	Victory = { Duration = 2.6, Attack = 0.25, Hold = 2 },
}

type Gesture = { Pose: Pose, Kind: string, Start: number, Duration: number, Attack: number, Hold: number }
type Joint = { Motor: Motor6D, BaseRotation: CFrame, Dirty: boolean }
type Rig = { Joints: { [string]: Joint }, Gestures: { Gesture }, NextLeft: boolean, Charge: number }

local rigs: { [Model]: Rig | false } = {}

local function getRig(model: Model): Rig?
	local existing = rigs[model]
	if existing ~= nil then
		return existing or nil
	end
	local joints = {}
	local found = 0
	for name, path in JOINTS do
		local part = model:FindFirstChild(path[1])
		local motor = part and part:FindFirstChild(path[2])
		if motor and motor:IsA("Motor6D") then
			joints[name] = { Motor = motor, BaseRotation = motor.C0.Rotation, Dirty = false }
			found += 1
		end
	end
	if found < 4 then
		rigs[model] = false -- not an R15 rig (e.g. R6 or the fallback bot rig); skip it
		return nil
	end
	local rig: Rig = { Joints = joints, Gestures = {}, NextLeft = false, Charge = 0 }
	rigs[model] = rig
	model.AncestryChanged:Connect(function(_, parent)
		if parent == nil then
			rigs[model] = nil
		end
	end)
	return rig
end

local function modelForFighter(fighterId: string): Model?
	for _, model in CollectionService:GetTagged("Fighter") do
		if model:GetAttribute("FighterId") == fighterId then
			return model
		end
	end
	return nil
end

-- Real animations (KeyframeSequences) ------------------------------------------------------------

local TRACK_NAMES = { "JabRight", "JabLeft", "Haymaker", "WindUp" }
local animationIds: { [string]: string } = {}
local useTracks = false
local trackCache: { [Model]: { [string]: AnimationTrack } } = setmetatable({}, { __mode = "k" }) :: any
local nextLeftTrack: { [Model]: boolean } = setmetatable({}, { __mode = "k" }) :: any

local function resolveAnimations()
	local folder = ReplicatedStorage:FindFirstChild("LaunchPartyAnimations")
	for _, name in TRACK_NAMES do
		local id = Config.Anims[name]
		if (not id or id == "") and RunService:IsStudio() and folder then
			-- In Studio we can play the animation files directly, no upload needed.
			local sequence = folder:FindFirstChild(name)
			if sequence and sequence:IsA("KeyframeSequence") then
				local ok, temporary = pcall(function()
					return KeyframeSequenceProvider:RegisterKeyframeSequence(sequence)
				end)
				if ok then
					id = temporary
				else
					warn("[LaunchParty] Couldn't load animation", name, temporary)
				end
			end
		end
		if id and id ~= "" then
			animationIds[name] = id
		end
	end
	useTracks = animationIds.JabRight ~= nil
		and animationIds.JabLeft ~= nil
		and animationIds.Haymaker ~= nil
		and animationIds.WindUp ~= nil
end

-- Other players' characters: their own client plays the animation and Roblox replicates it.
local function replicatedByOwner(model: Model): boolean
	return model ~= player.Character and Players:GetPlayerFromCharacter(model) ~= nil
end

local function getTrack(model: Model, name: string): AnimationTrack?
	local cache = trackCache[model]
	if not cache then
		cache = {}
		trackCache[model] = cache
	end
	if cache[name] then
		return cache[name]
	end
	local humanoid = model:FindFirstChildOfClass("Humanoid")
	local animator = humanoid and humanoid:FindFirstChildOfClass("Animator")
	if not animator then
		return nil
	end
	local animation = Instance.new("Animation")
	animation.AnimationId = animationIds[name]
	local ok, track = pcall(function()
		return animator:LoadAnimation(animation)
	end)
	if not ok or not track then
		return nil
	end
	track.Priority = Enum.AnimationPriority.Action
	track.Looped = name == "WindUp"
	cache[name] = track
	return track
end

-- Returns true if a real animation handled this attack.
local function playTrack(model: Model, kind: string): boolean
	if not useTracks or (kind ~= "Jab" and kind ~= "Haymaker") then
		return false
	end
	if replicatedByOwner(model) then
		return true
	end
	local name = kind
	if kind == "Jab" then
		name = if nextLeftTrack[model] then "JabLeft" else "JabRight"
		nextLeftTrack[model] = not nextLeftTrack[model]
	end
	local cache = trackCache[model]
	local windUp = cache and cache.WindUp
	if windUp and windUp.IsPlaying then
		windUp:Stop(0.05)
	end
	local track = getTrack(model, name)
	if track then
		track:Play(0.05, 1, 1)
	end
	return true
end

local function updateWindUpTrack(model: Model, charging: boolean)
	if replicatedByOwner(model) then
		return
	end
	local cache = trackCache[model]
	local track = if charging then getTrack(model, "WindUp") else cache and cache.WindUp
	if not track then
		return
	end
	if charging and not track.IsPlaying then
		track:Play(0.15)
	elseif not charging and track.IsPlaying then
		track:Stop(0.1)
	end
end

-- Public API --------------------------------------------------------------------------------

-- kind: "Jab" | "Haymaker" | "Dash" | "Flinch" | "Victory"
function AnimationController.Play(model: Model?, kind: string)
	if not model then
		return
	end
	if playTrack(model, kind) then
		return
	end
	local rig = getRig(model)
	local timing = GESTURES[kind]
	if not rig or not timing then
		return
	end
	local pose
	if kind == "Jab" then
		pose = if rig.NextLeft then POSES.JabLeft else POSES.JabRight
		rig.NextLeft = not rig.NextLeft
	else
		pose = POSES[kind]
	end
	-- A new attack replaces any attack still playing.
	for i = #rig.Gestures, 1, -1 do
		if rig.Gestures[i].Kind == kind or (kind ~= "Flinch" and rig.Gestures[i].Kind ~= "Flinch") then
			table.remove(rig.Gestures, i)
		end
	end
	table.insert(rig.Gestures, {
		Pose = pose,
		Kind = kind,
		Start = os.clock(),
		Duration = timing.Duration,
		Attack = timing.Attack,
		Hold = timing.Hold,
	})
end

function AnimationController.PlayForFighter(fighterId: string, kind: string)
	AnimationController.Play(modelForFighter(fighterId), kind)
end

-- Per-frame blending ---------------------------------------------------------------------------

local function envelope(gesture: Gesture, now: number): number
	local t = now - gesture.Start
	if t < gesture.Attack then
		local x = t / gesture.Attack
		return 1 - (1 - x) ^ 3
	elseif t < gesture.Attack + gesture.Hold then
		return 1
	end
	local releaseTime = gesture.Duration - gesture.Attack - gesture.Hold
	local x = math.clamp((t - gesture.Attack - gesture.Hold) / math.max(releaseTime, 0.01), 0, 1)
	return 1 - x * x * (3 - 2 * x)
end

local function addPose(totals: { [string]: Vector3 }, pose: Pose, weight: number)
	for joint, angles in pose do
		totals[joint] = (totals[joint] or Vector3.zero) + Vector3.new(angles[1], angles[2], angles[3]) * weight
	end
end

local function updateRig(model: Model, rig: Rig, now: number, dt: number)
	local totals: { [string]: Vector3 } = {}

	-- Charging wind-up blends in/out smoothly and trembles the longer you hold it.
	local charging = if model == player.Character then State.Charging else model:GetAttribute("Charging") == true
	if useTracks then
		updateWindUpTrack(model, charging)
		charging = false -- the real wind-up animation replaces the procedural one
	end
	rig.Charge = math.clamp(rig.Charge + (if charging then dt * 6 else -dt * 9), 0, 1)
	if rig.Charge > 0 then
		addPose(totals, POSES.WindUp, rig.Charge)
		if charging then
			local shake = math.min(rig.Charge, 1) * 3
			totals.RightShoulder = (totals.RightShoulder or Vector3.zero)
				+ Vector3.new(random:NextNumber(-shake, shake), 0, random:NextNumber(-shake, shake))
		end
	end

	for i = #rig.Gestures, 1, -1 do
		local gesture = rig.Gestures[i]
		if now - gesture.Start >= gesture.Duration then
			table.remove(rig.Gestures, i)
		else
			local weight = envelope(gesture, now)
			addPose(totals, gesture.Pose, weight)
			if gesture.Kind == "Victory" then
				-- Little fist pumps.
				local pump = math.sin((now - gesture.Start) * 12) * 18 * weight
				totals.RightElbow = (totals.RightElbow or Vector3.zero) + Vector3.new(pump, 0, 0)
				totals.LeftElbow = (totals.LeftElbow or Vector3.zero) + Vector3.new(-pump, 0, 0)
			end
		end
	end

	for name, joint in rig.Joints do
		local motor = joint.Motor
		if motor.Parent then
			local angles = totals[name]
			-- Keep the joint's current position (ScaleTo changes it), replace only the rotation.
			local base = CFrame.new(motor.C0.Position) * joint.BaseRotation
			if angles and angles.Magnitude > 0.01 then
				motor.C0 = base
					* CFrame.fromEulerAnglesYXZ(math.rad(angles.X), math.rad(angles.Y), math.rad(angles.Z))
				joint.Dirty = true
			elseif joint.Dirty then
				motor.C0 = base
				joint.Dirty = false
			end
		end
	end
end

function AnimationController.Start()
	resolveAnimations()
	RunService.RenderStepped:Connect(function(dt)
		local now = os.clock()
		local camera = Workspace.CurrentCamera
		local cameraPos = if camera then camera.CFrame.Position else Vector3.zero
		for _, model in CollectionService:GetTagged("Fighter") do
			if model:IsA("Model") then
				local root = model:FindFirstChild("HumanoidRootPart") :: BasePart?
				if root and (root.Position - cameraPos).Magnitude < 220 then
					local rig = getRig(model)
					if rig then
						local ok, err = pcall(updateRig, model, rig, now, dt)
						if not ok then
							warn("[LaunchParty] Animation error:", err)
							rigs[model] = false
						end
					end
				end
			end
		end
	end)
end

return AnimationController
