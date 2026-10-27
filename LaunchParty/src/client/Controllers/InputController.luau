-- Input: punch (tap) / charged punch (hold) / dash. Animations, sounds and dash movement are
-- predicted locally for instant feel; the server independently validates and resolves hits.
local CollectionService = game:GetService("CollectionService")
local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Movement = require(Shared:WaitForChild("Movement"))
local Net = require(Shared:WaitForChild("Net"))

local AnimationController = require(script.Parent.AnimationController)
local EffectsController = require(script.Parent.EffectsController)
local State = require(script.Parent.State)

local InputController = {}

local C = Config.Combat
local player = Players.LocalPlayer
local chargeRemote = Net.Event("ChargeStart")
local punchRemote = Net.Event("Punch")
local dashRemote = Net.Event("Dash")

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

local function flatten(vector: Vector3, fallback: Vector3): Vector3
	local flat = Vector3.new(vector.X, 0, vector.Z)
	if flat.Magnitude > 0.05 then
		return flat.Unit
	end
	local flatFallback = Vector3.new(fallback.X, 0, fallback.Z)
	if flatFallback.Magnitude > 0.05 then
		return flatFallback.Unit
	end
	return Vector3.new(0, 0, -1)
end

-- Camera-forward aim with gentle aim assist toward the most "in front" nearby fighter.
local function aimDirection(root: BasePart): Vector3
	local camera = Workspace.CurrentCamera
	local look = flatten(if camera then camera.CFrame.LookVector else root.CFrame.LookVector, root.CFrame.LookVector)
	local best, bestScore = nil, -math.huge
	for _, model in CollectionService:GetTagged("Fighter") do
		if model ~= player.Character and model:IsA("Model") then
			local otherRoot = model:FindFirstChild("HumanoidRootPart") :: BasePart?
			if otherRoot then
				local offset = otherRoot.Position - root.Position
				local flat = Vector3.new(offset.X, 0, offset.Z)
				local distance = flat.Magnitude
				if distance > 0.1 and distance < 11 and math.abs(offset.Y) < 7 then
					local dot = flat.Unit:Dot(look)
					if dot > 0.45 then
						local score = dot * 2 - distance / 11
						if score > bestScore then
							best, bestScore = flat.Unit, score
						end
					end
				end
			end
		end
	end
	return best or look
end

local function isFrozen(humanoid: Humanoid): boolean
	return humanoid.WalkSpeed <= 0.01 and humanoid.JumpPower <= 0.01
end

function InputController.BeginCharge()
	local _, humanoid, _ = getCharacter()
	if not humanoid or State.Charging or isFrozen(humanoid) or Movement.IsTumbling(humanoid) then
		return
	end
	local cooldown = player:GetAttribute("PunchCooldown") or C.PunchCooldown
	if os.clock() - State.LastPunch < cooldown then
		return
	end
	State.Charging = true
	State.ChargeStart = os.clock()
	chargeRemote:FireServer()
end

function InputController.ReleasePunch()
	if not State.Charging then
		return
	end
	State.Charging = false
	local _, humanoid, root = getCharacter()
	if not humanoid or not root then
		return
	end
	local chargeSpeed = player:GetAttribute("ChargeSpeed") or 1
	local alpha = math.clamp((os.clock() - State.ChargeStart) * chargeSpeed / C.ChargeMaxTime, 0, 1)
	local charged = alpha >= C.ChargeThreshold
	local aim = aimDirection(root)
	if not Movement.IsTumbling(humanoid) then
		root.CFrame = CFrame.lookAt(root.Position, root.Position + aim)
	end
	State.LastPunch = os.clock()
	AnimationController.Play(player.Character, if charged then "Haymaker" else "Jab")
	EffectsController.PlaySound(if charged then Config.Sounds.ChargedSwing else Config.Sounds.Swing, nil, 0.45)
	punchRemote:FireServer(aim)
end

function InputController.Dash()
	local _, humanoid, root = getCharacter()
	if not humanoid or not root or isFrozen(humanoid) then
		return
	end
	local now = os.clock()
	if now - State.LastKnockback < C.HitstunDashLock then
		return
	end

	local charges = player:GetAttribute("DashCharges") or 1
	while #State.DashReady < charges do
		table.insert(State.DashReady, 0)
	end
	while #State.DashReady > charges do
		table.remove(State.DashReady)
	end
	local slot = nil
	for index, readyAt in State.DashReady do
		if readyAt <= now then
			slot = index
			break
		end
	end
	if not slot then
		return
	end
	State.DashReady[slot] = now + (player:GetAttribute("DashCooldown") or C.DashCooldown)

	local direction = if humanoid.MoveDirection.Magnitude > 0.1
		then flatten(humanoid.MoveDirection, root.CFrame.LookVector)
		else aimDirection(root)
	State.Charging = false
	Movement.Dash(humanoid, root, direction, C)
	dashRemote:FireServer(direction)
	AnimationController.Play(player.Character, "Dash")
	State.Dashed:Fire()
	EffectsController.PlaySound(Config.Sounds.Dash, nil, 0.5, 1.3)
	EffectsController.FovKick(5)
end

function InputController.Start()
	player.CharacterAdded:Connect(function()
		State.Charging = false
		table.clear(State.DashReady)
	end)

	UserInputService.InputBegan:Connect(function(input, gameProcessed)
		if gameProcessed then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseButton1 then
			InputController.BeginCharge()
		elseif input.KeyCode == Enum.KeyCode.Q or input.KeyCode == Enum.KeyCode.LeftShift then
			InputController.Dash()
		end
	end)
	UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton1 then
			InputController.ReleasePunch()
		end
	end)

	-- Touch buttons + gamepad.
	ContextActionService:BindAction("LP_Punch", function(_, inputState)
		if inputState == Enum.UserInputState.Begin then
			InputController.BeginCharge()
		elseif inputState == Enum.UserInputState.End or inputState == Enum.UserInputState.Cancel then
			InputController.ReleasePunch()
		end
		return Enum.ContextActionResult.Sink
	end, true, Enum.KeyCode.ButtonR2)
	ContextActionService:SetTitle("LP_Punch", "PUNCH")
	ContextActionService:SetPosition("LP_Punch", UDim2.new(1, -200, 1, -110))

	ContextActionService:BindAction("LP_Dash", function(_, inputState)
		if inputState == Enum.UserInputState.Begin then
			InputController.Dash()
		end
		return Enum.ContextActionResult.Sink
	end, true, Enum.KeyCode.ButtonX, Enum.KeyCode.ButtonL2)
	ContextActionService:SetTitle("LP_Dash", "DASH")
	ContextActionService:SetPosition("LP_Dash", UDim2.new(1, -150, 1, -190))
end

return InputController
