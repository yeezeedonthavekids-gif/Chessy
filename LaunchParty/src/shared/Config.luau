-- All gameplay tuning lives here so balancing never requires touching logic.
local Config = {}

Config.GameName = "LAUNCH PARTY"

Config.Match = {
	MinFighters = 4, -- bots fill empty slots up to this many fighters
	MaxBots = 5,
	MinRealPlayers = 1,
	RoundsPerMatch = 5,
	FirstIntermission = 12,
	CountdownTime = 3,
	RoundTime = 90,
	SuddenDeathAt = 45, -- seconds into a round before the edges start crumbling
	CrumbleInterval = 2.2,
	FastCrumbleInterval = 0.7, -- used once no real player is still alive
	RoundEndTime = 4,
	DraftTime = 14,
	MatchEndTime = 11,
	PlacementPoints = { 3, 2, 1 },
	KOPoints = 1,
	BountyBonus = 1,
	KOCreditWindow = 6, -- seconds a hit still counts for KO credit
}

Config.Arena = {
	Center = Vector3.new(0, 100, 0),
	Radius = 46,
	TileSize = 7,
	VoidDepth = 35, -- fall this far below the arena surface and you're out
	MinTiles = 5,
}

Config.Lobby = {
	Center = Vector3.new(0, 140, 110),
	Size = Vector3.new(80, 2, 44),
	HeatCap = 40, -- lobby sparring can't build heat past this
	VoidDepth = 30,
}

Config.Combat = {
	PunchCooldown = 0.38,
	PunchRange = 6,
	RangeLeniency = 1.75, -- forgiveness for network latency
	PunchCone = 0.2, -- minimum dot product between aim and target direction
	JabHeat = 7,
	JabKnock = 30,
	ChargeMaxTime = 1.1,
	ChargeThreshold = 0.28, -- fraction of a full charge that counts as a charged punch
	ChargeHeatMult = 2.6,
	ChargeKnockMult = 2.3,
	ChargeRangeBonus = 2,
	ChargeWalkMult = 0.5,
	ShockwaveRadius = 12,
	ShockwavePower = 0.6,
	DashCooldown = 2.0,
	DashSpeed = 80,
	DashDuration = 0.18,
	AirDashLift = 14,
	DashBumpRadius = 4.5,
	DashBumpHeat = 5,
	DashBumpKnock = 26,
	HitstunDashLock = 0.15, -- can't dash-cancel a hit instantly
	-- knockback curve (see Shared/Knockback)
	HeatScale = 0.025,
	VerticalRatio = 0.42,
	VerticalBase = 10,
	MaxKnockSpeed = 230,
	TumbleBase = 0.3,
	TumblePerSpeed = 1 / 220,
	TumbleMax = 1.4,
	MaxActionsPerSecond = 16, -- remote spam protection
}

Config.Events = {
	LowGravity = 80,
	DefaultGravity = 196.2,
	MeteorInterval = { 0.9, 1.6 },
	MeteorRadius = 10,
	MeteorHeat = 14,
	MeteorKnock = 46,
	SweeperSpeed = { 0.9, 2.3 }, -- radians/sec, ramps up over the round
	SweeperHeat = 10,
	SweeperKnock = 42,
	GustInterval = 8,
	GustWarning = 1.6,
	GustKnock = 40,
}

Config.Anims = {
	-- Roblox-owned default R15 animations; usable in any experience.
	Punch = "rbxassetid://522635514",
	Charged = "rbxassetid://522638767",
	Idle = "rbxassetid://507766388",
	Walk = "rbxassetid://507777826",
}

Config.Sounds = {
	-- Built-in engine sounds. Swap for your own uploaded audio any time.
	Swing = "rbxasset://sounds/swordslash.wav",
	ChargedSwing = "rbxasset://sounds/swordlunge.wav",
	Hit = "rbxasset://sounds/collide.wav",
	KO = "rbxasset://sounds/Launching rocket.wav",
	Dash = "rbxasset://sounds/action_jump.mp3",
	Pick = "rbxasset://sounds/electronicpingshort.wav",
	Boom = "rbxasset://sounds/collide.wav",
}

return Config
