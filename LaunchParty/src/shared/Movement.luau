-- Physical movement shared by clients (their own character) and the server (bots).
-- Whoever owns a character's physics must be the one to move it, so both sides use this.
local Movement = {}

local tumbleTokens: { [Humanoid]: number } = setmetatable({}, { __mode = "k" }) :: any
local random = Random.new()

local function nextToken(humanoid: Humanoid): number
	local token = (tumbleTokens[humanoid] or 0) + 1
	tumbleTokens[humanoid] = token
	return token
end

function Movement.Recover(humanoid: Humanoid)
	if humanoid.Parent and humanoid.Health > 0 then
		humanoid.PlatformStand = false
		humanoid:ChangeState(Enum.HumanoidStateType.GettingUp)
	end
end

function Movement.IsTumbling(humanoid: Humanoid): boolean
	return humanoid.PlatformStand
end

function Movement.CancelTumble(humanoid: Humanoid)
	nextToken(humanoid)
	if humanoid.PlatformStand then
		Movement.Recover(humanoid)
	end
end

-- Launch a character. `tumble` seconds of ragdoll-ish loss of control; 0 just sets velocity.
function Movement.Knockback(humanoid: Humanoid, root: BasePart, velocity: Vector3, tumble: number)
	if not humanoid.Parent or not root.Parent then
		return
	end
	local token = nextToken(humanoid)
	if tumble > 0 then
		humanoid.PlatformStand = true
	end
	root.AssemblyLinearVelocity = velocity
	if tumble > 0 and velocity.Magnitude > 1 then
		local spin = math.clamp(velocity.Magnitude / 60, 0.3, 2)
		root.AssemblyAngularVelocity = Vector3.new(
			random:NextNumber(-8, 8),
			random:NextNumber(-4, 4),
			random:NextNumber(-8, 8)
		) * spin
	end
	if tumble > 0 then
		task.delay(tumble, function()
			if tumbleTokens[humanoid] == token then
				Movement.Recover(humanoid)
			end
		end)
	end
end

export type DashTuning = { DashSpeed: number, DashDuration: number, AirDashLift: number }

-- Short, snappy burst. Cancels tumble so it doubles as a recovery move.
function Movement.Dash(humanoid: Humanoid, root: BasePart, direction: Vector3, tuning: DashTuning)
	if not humanoid.Parent or not root.Parent then
		return
	end
	Movement.CancelTumble(humanoid)
	local airborne = humanoid.FloorMaterial == Enum.Material.Air

	local old = root:FindFirstChild("DashVelocity")
	if old then
		old:Destroy()
	end
	local attachment = root:FindFirstChild("DashAttachment") :: Attachment?
	if not attachment then
		local created = Instance.new("Attachment")
		created.Name = "DashAttachment"
		created.Parent = root
		attachment = created
	end

	local mover = Instance.new("LinearVelocity")
	mover.Name = "DashVelocity"
	mover.Attachment0 = attachment
	mover.RelativeTo = Enum.ActuatorRelativeTo.World
	mover.VelocityConstraintMode = Enum.VelocityConstraintMode.Vector
	mover.MaxForce = math.huge
	mover.VectorVelocity = direction * tuning.DashSpeed + Vector3.new(0, if airborne then tuning.AirDashLift else 0, 0)
	mover.Parent = root

	task.delay(tuning.DashDuration, function()
		if mover.Parent then
			mover:Destroy()
		end
	end)
end

return Movement
