-- Server-authoritative combat. Clients only *request* actions; the server validates timing,
-- range and state, resolves hits against server-side positions, then tells physics owners to launch.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage.Shared
local Config = require(Shared.Config)
local Knockback = require(Shared.Knockback)
local Movement = require(Shared.Movement)
local Net = require(Shared.Net)

local FighterService = require(script.Parent.FighterService)

type Fighter = FighterService.Fighter

local CombatService = {}

local C = Config.Combat
local effectRemote = Net.Event("Effect")

local arenaLive = false
local hitListeners: { (Fighter, Fighter, string) -> () } = {}
local rateBuckets: { [Player]: { Tokens: number, Last: number } } = {}

-- Validation helpers -------------------------------------------------------------

local function isFiniteVector(value: any): boolean
	if typeof(value) ~= "Vector3" then
		return false
	end
	for _, axis in { value.X, value.Y, value.Z } do
		if axis ~= axis or math.abs(axis) > 1e5 then
			return false
		end
	end
	return true
end

local function flatUnit(value: any, fallback: Vector3): Vector3
	if isFiniteVector(value) then
		local flat = Vector3.new(value.X, 0, value.Z)
		if flat.Magnitude > 0.05 then
			return flat.Unit
		end
	end
	local flatFallback = Vector3.new(fallback.X, 0, fallback.Z)
	if flatFallback.Magnitude > 0.05 then
		return flatFallback.Unit
	end
	return Vector3.new(0, 0, -1)
end

local function allowRequest(player: Player): boolean
	local now = os.clock()
	local bucket = rateBuckets[player]
	if not bucket then
		bucket = { Tokens = C.MaxActionsPerSecond, Last = now }
		rateBuckets[player] = bucket
	end
	bucket.Tokens = math.min(C.MaxActionsPerSecond, bucket.Tokens + (now - bucket.Last) * C.MaxActionsPerSecond)
	bucket.Last = now
	if bucket.Tokens < 1 then
		return false
	end
	bucket.Tokens -= 1
	return true
end

-- State ----------------------------------------------------------------------------

function CombatService.SetArenaLive(live: boolean)
	arenaLive = live
	if not live then
		for _, fighter in FighterService.All() do
			if fighter.Zone == "Arena" and fighter.ChargeStart then
				FighterService.SetCharging(fighter, false)
			end
		end
	end
end

-- Called with (attacker, victim, kind) whenever a fighter lands a hit.
function CombatService.OnHit(callback: (Fighter, Fighter, string) -> ())
	table.insert(hitListeners, callback)
end

function CombatService.IsArenaLive(): boolean
	return arenaLive
end

function CombatService.CanAct(fighter: Fighter): boolean
	if fighter.Frozen or not FighterService.IsAlive(fighter) then
		return false
	end
	if fighter.Zone == "Lobby" then
		return true
	end
	return fighter.Zone == "Arena" and fighter.Alive and arenaLive
end

local function canBeHit(attacker: Fighter, target: Fighter): boolean
	if target == attacker or target.Zone ~= attacker.Zone or not FighterService.IsAlive(target) then
		return false
	end
	if target.Zone == "Arena" then
		return target.Alive
	end
	return target.Zone == "Lobby"
end

-- Hits ----------------------------------------------------------------------------

type HitSpec = {
	Heat: number,
	Knock: number,
	Direction: Vector3, -- flat unit vector
	Kind: string, -- "Jab" | "Charged" | "Shockwave" | "Bump" | environment names
	Power: number, -- 0..1, purely cosmetic
}

local function launch(victim: Fighter, attacker: Fighter?, spec: HitSpec)
	local victimStats = victim.Stats
	local dealtHeat = if attacker then attacker.Stats.HeatDealt else 1
	local dealtKnock = if attacker then attacker.Stats.KnockDealt else 1

	local heatGain = spec.Heat * dealtHeat * victimStats.HeatTaken
	FighterService.AddHeat(victim, heatGain)

	local speed = Knockback.Speed(spec.Knock, victim.Heat, dealtKnock, victimStats.KnockTaken, C)
	local velocity = spec.Direction * speed + Vector3.new(0, Knockback.Vertical(speed, C), 0)
	local tumble = Knockback.Tumble(speed, C)
	FighterService.ApplyKnockback(victim, velocity, tumble)

	if attacker then
		victim.LastHitBy = attacker
		victim.LastHitTime = os.clock()
		if attacker.Stats.LifeSteal > 0 then
			FighterService.AddHeat(attacker, -attacker.Stats.LifeSteal)
		end
		if victimStats.Thorns > 0 then
			FighterService.AddHeat(attacker, heatGain * victimStats.Thorns)
		end
	end

	if attacker then
		for _, listener in hitListeners do
			task.spawn(listener, attacker, victim, spec.Kind)
		end
	end

	effectRemote:FireAllClients("Hit", {
		Position = (victim.Root :: BasePart).Position,
		Attacker = if attacker then attacker.Id else nil,
		Victim = victim.Id,
		Kind = spec.Kind,
		Power = spec.Power,
		Speed = speed,
		Heat = math.floor(heatGain + 0.5),
	})
end

-- Environmental hazards (meteors, sweeper, gusts). Keeps existing KO credit intact.
function CombatService.EnvironmentHit(victim: Fighter, direction: Vector3, heat: number, knock: number, kind: string)
	if not FighterService.IsAlive(victim) then
		return
	end
	launch(victim, nil, {
		Heat = heat,
		Knock = knock,
		Direction = flatUnit(direction, Vector3.new(1, 0, 0)),
		Kind = kind,
		Power = 0.6,
	})
end

-- Actions (shared by remotes and bots) --------------------------------------------

function CombatService.BeginCharge(fighter: Fighter): boolean
	if not CombatService.CanAct(fighter) or fighter.ChargeStart then
		return false
	end
	if os.clock() < fighter.TumbleUntil then
		return false
	end
	FighterService.SetCharging(fighter, true)
	return true
end

function CombatService.ReleasePunch(fighter: Fighter, aimInput: any): boolean
	local now = os.clock()
	local chargeStart = fighter.ChargeStart
	if chargeStart then
		FighterService.SetCharging(fighter, false)
	end
	if not CombatService.CanAct(fighter) or now < fighter.TumbleUntil then
		return false
	end
	local stats = fighter.Stats
	local cooldown = C.PunchCooldown * stats.PunchCooldownMult
	if now - fighter.LastPunch < cooldown - 0.06 then
		return false
	end
	fighter.LastPunch = now

	local alpha = 0
	if chargeStart then
		alpha = math.clamp((now - chargeStart) * stats.ChargeSpeed / C.ChargeMaxTime, 0, 1)
	end
	local charged = alpha >= C.ChargeThreshold
	local power = if charged then alpha else 0

	local root = fighter.Root :: BasePart
	local aim = flatUnit(aimInput, root.CFrame.LookVector)
	local origin = root.Position
	local range = C.PunchRange + C.RangeLeniency + (if charged then C.ChargeRangeBonus else 0)

	-- Every client animates the swing (procedural, see AnimationController).
	effectRemote:FireAllClients("Swing", { Fighter = fighter.Id, Charged = charged })

	local candidates = {}
	for _, other in FighterService.All() do
		if canBeHit(fighter, other) then
			local offset = (other.Root :: BasePart).Position - origin
			local flat = Vector3.new(offset.X, 0, offset.Z)
			local distance = flat.Magnitude
			if distance <= range and math.abs(offset.Y) < 7 then
				local dot = if distance > 0.01 then flat.Unit:Dot(aim) else 1
				if dot >= C.PunchCone or distance < 2.5 then
					table.insert(candidates, { Fighter = other, Distance = distance, Flat = flat })
				end
			end
		end
	end
	table.sort(candidates, function(a, b)
		return a.Distance < b.Distance
	end)

	local heat = C.JabHeat * (1 + (C.ChargeHeatMult - 1) * power)
	local knock = C.JabKnock * (1 + (C.ChargeKnockMult - 1) * power)
	local hitSet: { [Fighter]: boolean } = {}
	local maxTargets = if charged then #candidates else math.min(1, #candidates)

	for i = 1, maxTargets do
		local entry = candidates[i]
		local toTarget = if entry.Distance > 0.01 then entry.Flat.Unit else aim
		local direction = (aim * 0.6 + toTarget * 0.4)
		hitSet[entry.Fighter] = true
		launch(entry.Fighter, fighter, {
			Heat = heat,
			Knock = knock,
			Direction = flatUnit(direction, aim),
			Kind = if charged then "Charged" else "Jab",
			Power = power,
		})
	end

	if charged and stats.Shockwave > 0 then
		effectRemote:FireAllClients("Shockwave", { Position = origin, Radius = C.ShockwaveRadius })
		for _, other in FighterService.All() do
			if not hitSet[other] and canBeHit(fighter, other) then
				local offset = (other.Root :: BasePart).Position - origin
				local flat = Vector3.new(offset.X, 0, offset.Z)
				if flat.Magnitude <= C.ShockwaveRadius and math.abs(offset.Y) < 9 then
					launch(other, fighter, {
						Heat = heat * C.ShockwavePower,
						Knock = knock * C.ShockwavePower,
						Direction = flatUnit(flat, aim),
						Kind = "Shockwave",
						Power = power,
					})
				end
			end
		end
	end
	return true
end

function CombatService.TryDash(fighter: Fighter, directionInput: any): boolean
	if not CombatService.CanAct(fighter) then
		return false
	end
	local now = os.clock()
	if now - fighter.LastHitTime < C.HitstunDashLock then
		return false
	end
	local slot = nil
	for index, readyAt in fighter.DashReady do
		if readyAt <= now + 0.08 then
			slot = index
			break
		end
	end
	if not slot then
		return false
	end
	fighter.DashReady[slot] = now + C.DashCooldown * fighter.Stats.DashCooldownMult

	local root = fighter.Root :: BasePart
	local direction = flatUnit(directionInput, root.CFrame.LookVector)
	if fighter.ChargeStart then
		FighterService.SetCharging(fighter, false)
	end
	fighter.TumbleUntil = 0
	fighter.DashUntil = now + C.DashDuration + 0.12
	fighter.DashDir = direction
	fighter.DashHits = {}

	if not fighter.Player then
		Movement.Dash(fighter.Humanoid :: Humanoid, root, direction, C)
	end
	effectRemote:FireAllClients("Dash", { Position = root.Position, Fighter = fighter.Id })
	return true
end

-- Per-frame: dash bumps, motion trails, dummy cooldown ----------------------------

local function step()
	local now = os.clock()
	local all = FighterService.All()
	for _, fighter in all do
		if FighterService.IsAlive(fighter) then
			local root = fighter.Root :: BasePart
			if fighter.Trail then
				fighter.Trail.Enabled = root.AssemblyLinearVelocity.Magnitude > 28
			end

			if fighter.DashUntil > now then
				for _, other in all do
					if not fighter.DashHits[other] and canBeHit(fighter, other) then
						local distance = ((other.Root :: BasePart).Position - root.Position).Magnitude
						if distance <= C.DashBumpRadius then
							fighter.DashHits[other] = true
							launch(other, fighter, {
								Heat = C.DashBumpHeat,
								Knock = C.DashBumpKnock * fighter.Stats.BumpMult,
								Direction = fighter.DashDir,
								Kind = "Bump",
								Power = 0.4,
							})
						end
					end
				end
			end

			if fighter.IsDummy and fighter.Heat > 0 and now - fighter.LastHitTime > 3 then
				FighterService.SetHeat(fighter, 0)
			end
		end
	end
end

function CombatService.Init()
	Net.Event("ChargeStart").OnServerEvent:Connect(function(player)
		if not allowRequest(player) then
			return
		end
		local fighter = FighterService.GetByPlayer(player)
		if fighter then
			CombatService.BeginCharge(fighter)
		end
	end)

	Net.Event("Punch").OnServerEvent:Connect(function(player, aim)
		if not allowRequest(player) then
			return
		end
		local fighter = FighterService.GetByPlayer(player)
		if fighter then
			CombatService.ReleasePunch(fighter, aim)
		end
	end)

	Net.Event("Dash").OnServerEvent:Connect(function(player, direction)
		if not allowRequest(player) then
			return
		end
		local fighter = FighterService.GetByPlayer(player)
		if fighter then
			CombatService.TryDash(fighter, direction)
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		rateBuckets[player] = nil
	end)

	RunService.Heartbeat:Connect(function()
		local ok, err = pcall(step)
		if not ok then
			warn("[LaunchParty] Combat step error:", err)
		end
	end)
end

return CombatService
