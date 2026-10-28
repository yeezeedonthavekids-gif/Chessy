-- Simple server-side anticheat for the things a movement game cares about:
--   * speed hacks / teleporting   (moving faster than anything legal allows)
--   * flying                      (staying higher than any legal jump for too long)
--   * ignoring knockback          (a big launch that doesn't move you at all)
-- Combat, heat, points, purchases and stats are already decided by the server, so they
-- can't be cheated from the client in the first place.
--
-- Suspicious movement gets rubber-banded back to the last good spot and adds a strike.
-- Strikes wear off over time; too many in a short span = kick. Never kicks in Studio.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)

local ArenaService = require(script.Parent.ArenaService)
local FighterService = require(script.Parent.FighterService)

type Fighter = FighterService.Fighter

local AntiCheatService = {}

local AC = Config.AntiCheat
local C = Config.Combat
local CHECK_INTERVAL = 0.25

type Sample = { Time: number, Position: Vector3 }
type Track = {
	Model: Model?,
	Samples: { Sample },
	LastGood: Vector3?,
	HighSince: number?,
	Strikes: number,
	LastDecay: number,
	CheckedLaunch: number,
}

local tracks: { [Player]: Track } = {}

local function flat(vector: Vector3): Vector3
	return Vector3.new(vector.X, 0, vector.Z)
end

-- After a launch you keep flying for a while even once the tumble ends.
local function inLaunchGrace(fighter: Fighter, now: number): boolean
	local airtime = 3 * (Config.Events.DefaultGravity / math.max(Workspace.Gravity, 1))
	return now < fighter.TumbleUntil + airtime
end

local function strike(player: Player, track: Track, fighter: Fighter, reason: string, amount: number?)
	track.Strikes += amount or 1
	warn(string.format("[LaunchParty AntiCheat] %s: %s (strikes %d/%d)", player.Name, reason, track.Strikes, AC.KickAt))
	if track.LastGood and FighterService.IsAlive(fighter) then
		FighterService.Teleport(fighter, CFrame.new(track.LastGood + Vector3.new(0, 2, 0)))
	end
	table.clear(track.Samples)
	track.HighSince = nil
	if track.Strikes >= AC.KickAt and not RunService:IsStudio() then
		player:Kick("Kicked for unusual movement. If that wasn't you cheating, sorry! Just rejoin.")
	end
end

local function floorY(fighter: Fighter): number?
	if fighter.Zone == "Arena" then
		return ArenaService.GetCenter().Y
	elseif fighter.Zone == "Lobby" then
		return Config.Lobby.Center.Y
	end
	return nil
end

local function check(player: Player, now: number)
	local fighter = FighterService.GetByPlayer(player)
	if not fighter or not FighterService.IsAlive(fighter) then
		return
	end
	local track = tracks[player]
	if not track then
		track = { Samples = {}, Strikes = 0, LastDecay = now, CheckedLaunch = 0 }
		tracks[player] = track
	end

	-- Strikes wear off.
	if now - track.LastDecay >= AC.StrikeDecay then
		track.Strikes = math.max(0, track.Strikes - 1)
		track.LastDecay = now
	end

	local root = fighter.Root :: BasePart
	local humanoid = fighter.Humanoid :: Humanoid
	local position = root.Position

	-- New character or a server teleport: start fresh.
	if track.Model ~= fighter.Model or now < fighter.TeleportGraceUntil then
		track.Model = fighter.Model
		table.clear(track.Samples)
		track.LastGood = position
		track.HighSince = nil
		return
	end

	local launched = inLaunchGrace(fighter, now)
	local dashed = now - fighter.DashUntil < 1.5

	-- 1. Speed / teleport, measured over a ~1s window so lag spikes don't look like cheating.
	table.insert(track.Samples, { Time = now, Position = position })
	while #track.Samples > 2 and now - track.Samples[2].Time >= AC.Window do
		table.remove(track.Samples, 1)
	end
	local oldest = track.Samples[1]
	local elapsed = now - oldest.Time
	if elapsed >= AC.Window * 0.9 then
		local speed = flat(position - oldest.Position).Magnitude / elapsed
		local allowed = humanoid.WalkSpeed * AC.WalkSlack + 12
		if launched then
			allowed = C.MaxKnockSpeed * 1.25 + 20
		elseif dashed then
			allowed = math.max(allowed, C.DashSpeed * 0.6 + 30)
		end
		if speed > allowed then
			strike(player, track, fighter, string.format("moving too fast (%.0f > %.0f studs/s)", speed, allowed))
			return
		end
		track.LastGood = oldest.Position
	end

	-- 2. Flying: higher than the best possible jump for more than a moment.
	local floor = floorY(fighter)
	if floor and not launched and not dashed then
		local gravity = math.max(Workspace.Gravity, 1)
		local maxJump = (humanoid.JumpPower ^ 2) / (2 * gravity)
		local height = position.Y - floor
		if height > maxJump + 4 + AC.FlySlack then
			track.HighSince = track.HighSince or now
			if now - track.HighSince > 1.5 then
				strike(player, track, fighter, string.format("flying (%.0f studs up)", height))
				return
			end
		else
			track.HighSince = nil
		end
	else
		track.HighSince = nil
	end

	-- 3. Ignoring knockback: a big launch should move you a good distance.
	local launch = fighter.LastLaunch
	if launch and launch.Time ~= track.CheckedLaunch and now - launch.Time >= 0.8 then
		track.CheckedLaunch = launch.Time
		if fighter.Zone == "Arena" and fighter.Alive and launch.Speed >= AC.AntiKnockbackSpeed and not dashed then
			local moved = flat(position - launch.Position).Magnitude
			if moved < 3 then
				strike(player, track, fighter, string.format("ignored a %.0f studs/s launch", launch.Speed), 2)
			end
		end
	end
end

function AntiCheatService.Init()
	if not AC.Enabled then
		return
	end
	Players.PlayerRemoving:Connect(function(player)
		tracks[player] = nil
	end)
	task.spawn(function()
		while true do
			task.wait(CHECK_INTERVAL)
			local now = os.clock()
			for _, player in Players:GetPlayers() do
				local ok, err = pcall(check, player, now)
				if not ok then
					warn("[LaunchParty AntiCheat] check failed:", err)
				end
			end
		end
	end)
end

return AntiCheatService
