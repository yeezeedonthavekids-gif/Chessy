-- Round modifiers. Each event has Start() which returns a cleanup function.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage.Shared
local Config = require(Shared.Config)
local Net = require(Shared.Net)

local ArenaService = require(script.Parent.ArenaService)
local BotService = require(script.Parent.BotService)
local CombatService = require(script.Parent.CombatService)
local FighterService = require(script.Parent.FighterService)

local EventService = {}

local E = Config.Events
local effectRemote = Net.Event("Effect")
local rng = Random.new()

export type EventDef = {
	Id: string,
	Name: string,
	Description: string,
	Start: () -> () -> (),
}

local function noop() end

local function flatOffset(a: Vector3, b: Vector3): Vector3
	local offset = a - b
	return Vector3.new(offset.X, 0, offset.Z)
end

local function hazardFolder(): Folder
	local folder = Instance.new("Folder")
	folder.Name = "EventHazards"
	folder.Parent = Workspace
	return folder
end

-- Meteor Shower ---------------------------------------------------------------------

local function dropMeteor(folder: Folder, target: Vector3)
	local warning = Instance.new("Part")
	warning.Name = "MeteorWarning"
	warning.Shape = Enum.PartType.Cylinder
	warning.Size = Vector3.new(0.2, E.MeteorRadius * 2, E.MeteorRadius * 2)
	warning.CFrame = CFrame.new(target + Vector3.new(0, 0.15, 0)) * CFrame.Angles(0, 0, math.rad(90))
	warning.Anchored = true
	warning.CanCollide = false
	warning.CanQuery = false
	warning.CanTouch = false
	warning.Material = Enum.Material.Neon
	warning.Color = Color3.fromRGB(255, 70, 50)
	warning.Transparency = 0.65
	warning.Parent = folder
	TweenService:Create(warning, TweenInfo.new(0.25, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true), {
		Transparency = 0.25,
	}):Play()

	local meteor = Instance.new("Part")
	meteor.Name = "Meteor"
	meteor.Shape = Enum.PartType.Ball
	meteor.Size = Vector3.one * 6
	meteor.Material = Enum.Material.Basalt
	meteor.Color = Color3.fromRGB(80, 50, 40)
	meteor.Anchored = true
	meteor.CanCollide = false
	meteor.CanQuery = false
	meteor.CanTouch = false
	local start = target + Vector3.new(rng:NextNumber(-30, 30), 95, rng:NextNumber(-30, 30))
	meteor.CFrame = CFrame.new(start)
	local fire = Instance.new("Fire")
	fire.Size = 9
	fire.Heat = 15
	fire.Parent = meteor
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 140, 60)
	light.Range = 18
	light.Brightness = 3
	light.Parent = meteor
	meteor.Parent = folder

	local fall = TweenService:Create(meteor, TweenInfo.new(1.3, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
		CFrame = CFrame.new(target + Vector3.new(0, 2, 0)),
	})
	fall.Completed:Connect(function(state)
		warning:Destroy()
		meteor:Destroy()
		if state ~= Enum.PlaybackState.Completed or not folder.Parent then
			return
		end
		effectRemote:FireAllClients("Meteor", { Position = target, Radius = E.MeteorRadius })
		for _, fighter in FighterService.AliveInArena() do
			local offset = flatOffset((fighter.Root :: BasePart).Position, target)
			if offset.Magnitude <= E.MeteorRadius then
				local direction = if offset.Magnitude > 0.1 then offset.Unit else Vector3.new(rng:NextNumber(-1, 1), 0, 1)
				CombatService.EnvironmentHit(fighter, direction, E.MeteorHeat, E.MeteorKnock, "Meteor")
			end
		end
		ArenaService.BreakTilesNear(target, 4)
	end)
	fall:Play()
end

local function startMeteors(): () -> ()
	local folder = hazardFolder()
	local running = true
	task.spawn(function()
		task.wait(2)
		while running do
			local target = ArenaService.RandomTilePosition()
			if target then
				dropMeteor(folder, target)
			end
			task.wait(rng:NextNumber(E.MeteorInterval[1], E.MeteorInterval[2]))
		end
	end)
	return function()
		running = false
		folder:Destroy()
	end
end

-- The Sweeper ------------------------------------------------------------------------

local function startSweeper(): () -> ()
	local folder = hazardFolder()
	local center = ArenaService.GetCenter()
	local length = Config.Arena.Radius * 2 + 10

	local beam = Instance.new("Part")
	beam.Name = "SweeperBeam"
	beam.Size = Vector3.new(length, 1.6, 1.6)
	beam.Anchored = true
	beam.CanCollide = false
	beam.CanQuery = false
	beam.CanTouch = false
	beam.Material = Enum.Material.Neon
	beam.Color = Color3.fromRGB(255, 60, 90)
	beam.Parent = folder

	local hub = Instance.new("Part")
	hub.Name = "SweeperHub"
	hub.Shape = Enum.PartType.Cylinder
	hub.Size = Vector3.new(5, 5, 5)
	hub.CFrame = CFrame.new(center + Vector3.new(0, 2.5, 0)) * CFrame.Angles(0, 0, math.rad(90))
	hub.Anchored = true
	hub.Material = Enum.Material.Metal
	hub.Color = Color3.fromRGB(50, 50, 60)
	hub.Parent = folder

	local angle = rng:NextNumber(0, math.pi * 2)
	local started = os.clock()
	local cooldowns: { [any]: number } = {}

	local connection = RunService.Heartbeat:Connect(function(dt)
		local ramp = math.clamp((os.clock() - started) / 40, 0, 1)
		local omega = E.SweeperSpeed[1] + (E.SweeperSpeed[2] - E.SweeperSpeed[1]) * ramp
		angle += omega * dt
		beam.CFrame = CFrame.new(center + Vector3.new(0, 2.2, 0)) * CFrame.Angles(0, angle, 0)
		if not CombatService.IsArenaLive() then
			return
		end

		local axis = Vector3.new(math.cos(angle), 0, -math.sin(angle))
		local sweepDir = Vector3.new(-math.sin(angle), 0, -math.cos(angle))
		local now = os.clock()
		for _, fighter in FighterService.AliveInArena() do
			local position = (fighter.Root :: BasePart).Position
			local relative = flatOffset(position, center)
			local along = relative:Dot(axis)
			local perpendicular = (relative - axis * along).Magnitude
			local height = position.Y - center.Y
			if math.abs(along) <= length / 2 and perpendicular < 2.6 and height < 4.6 then
				if (cooldowns[fighter] or 0) <= now then
					cooldowns[fighter] = now + 0.7
					local push = sweepDir * (if along >= 0 then 1 else -1)
					CombatService.EnvironmentHit(fighter, push, E.SweeperHeat, E.SweeperKnock, "Sweeper")
				end
			elseif fighter.IsBot and perpendicular < 6 and height < 4.6 then
				-- Bots try to hop the beam, better bots more reliably.
				if ArenaService.HasFloor(position) and rng:NextNumber() < 0.05 + BotService.GetSkill(fighter) * 0.12 then
					(fighter.Humanoid :: Humanoid).Jump = true
				end
			end
		end
	end)

	return function()
		connection:Disconnect()
		folder:Destroy()
	end
end

-- Gusts ------------------------------------------------------------------------------

local function startGusts(): () -> ()
	local running = true
	task.spawn(function()
		task.wait(4)
		while running do
			local angle = rng:NextNumber(0, math.pi * 2)
			local direction = Vector3.new(math.cos(angle), 0, math.sin(angle))
			effectRemote:FireAllClients("GustWarning", { Direction = direction, Center = ArenaService.GetCenter() })
			task.wait(E.GustWarning)
			if not running then
				break
			end
			effectRemote:FireAllClients("Gust", { Direction = direction, Center = ArenaService.GetCenter() })
			for _, fighter in FighterService.AliveInArena() do
				CombatService.EnvironmentHit(fighter, direction, 0, E.GustKnock, "Gust")
			end
			task.wait(E.GustInterval)
		end
	end)
	return function()
		running = false
	end
end

-- Registry ---------------------------------------------------------------------------

EventService.Classic = {
	Id = "Classic",
	Name = "Classic",
	Description = "Nothing special this round. Just punching.",
	Start = function()
		return noop
	end,
} :: EventDef

EventService.Events = {
	{
		Id = "LowGravity",
		Name = "Low Gravity",
		Description = "Everyone floats. Hits send you flying way further.",
		Start = function()
			Workspace.Gravity = E.LowGravity
			return function()
				Workspace.Gravity = E.DefaultGravity
			end
		end,
	},
	{
		Id = "Meteors",
		Name = "Meteor Shower",
		Description = "Stay out of the red circles. Meteors knock holes in the floor.",
		Start = startMeteors,
	},
	{
		Id = "Ice",
		Name = "Ice Rink",
		Description = "The floor is ice, so you slide a lot further when you get hit.",
		Start = function()
			ArenaService.SetIce(true)
			return noop
		end,
	},
	{
		Id = "Sweeper",
		Name = "The Sweeper",
		Description = "There's a spinning laser and it keeps speeding up. Jump over it.",
		Start = startSweeper,
	},
	{
		Id = "Gusts",
		Name = "Gusty Skies",
		Description = "Big gusts of wind push everyone around. Watch for the warning.",
		Start = startGusts,
	},
} :: { EventDef }

local lastEventId: string? = nil
local activeStop: (() -> ())? = nil

function EventService.Pick(round: number): EventDef
	if round == 1 then
		lastEventId = EventService.Classic.Id
		return EventService.Classic
	end
	local options = {}
	for _, event in EventService.Events do
		if event.Id ~= lastEventId then
			table.insert(options, event)
		end
	end
	local chosen = options[rng:NextInteger(1, #options)]
	lastEventId = chosen.Id
	return chosen
end

function EventService.Start(event: EventDef)
	EventService.Stop()
	local ok, result = pcall(event.Start)
	if ok and type(result) == "function" then
		activeStop = result
	else
		warn("[LaunchParty] Event failed to start:", event.Id, result)
	end
end

function EventService.Stop()
	local stop = activeStop
	activeStop = nil
	if stop then
		local ok, err = pcall(stop)
		if not ok then
			warn("[LaunchParty] Event cleanup failed:", err)
		end
	end
	Workspace.Gravity = E.DefaultGravity
end

return EventService
