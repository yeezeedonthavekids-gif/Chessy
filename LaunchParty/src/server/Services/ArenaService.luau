-- Builds the world: sky and lighting themes, the lobby, and a fresh floating-island arena every round.
local Debris = game:GetService("Debris")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)

local ArenaService = {}

local ARENA = Config.Arena
local LOBBY = Config.Lobby

local WARN = Color3.fromRGB(255, 70, 50)
local ICE = Color3.fromRGB(200, 235, 255)

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

-- Themes ----------------------------------------------------------------------------------

export type Theme = {
	Name: string,
	Tiles: { Color3 },
	Material: Enum.Material,
	NeonRings: boolean?,
	Dirt: Color3,
	ClockTime: number,
	Brightness: number,
	Ambient: Color3,
	Outdoor: Color3,
	AtmosphereColor: Color3,
	AtmosphereDecay: Color3,
	Haze: number,
	CloudColor: Color3,
	CloudCover: number,
}

ArenaService.Themes = {
	{
		Name = "Sunny Meadow",
		Tiles = { rgb(120, 225, 95), rgb(255, 225, 90), rgb(110, 205, 255), rgb(255, 140, 185) },
		Material = Enum.Material.SmoothPlastic,
		Dirt = rgb(135, 92, 62),
		ClockTime = 13.5,
		Brightness = 2.6,
		Ambient = rgb(110, 110, 130),
		Outdoor = rgb(160, 160, 180),
		AtmosphereColor = rgb(190, 225, 255),
		AtmosphereDecay = rgb(100, 160, 230),
		Haze = 1,
		CloudColor = rgb(255, 255, 255),
		CloudCover = 0.6,
	},
	{
		Name = "Candy Clouds",
		Tiles = { rgb(255, 160, 210), rgb(160, 240, 210), rgb(200, 175, 255), rgb(255, 235, 150) },
		Material = Enum.Material.SmoothPlastic,
		Dirt = rgb(190, 120, 160),
		ClockTime = 16.4,
		Brightness = 2.4,
		Ambient = rgb(140, 110, 140),
		Outdoor = rgb(190, 160, 190),
		AtmosphereColor = rgb(255, 205, 235),
		AtmosphereDecay = rgb(210, 120, 210),
		Haze = 1.6,
		CloudColor = rgb(255, 215, 240),
		CloudCover = 0.7,
	},
	{
		Name = "Sunset Splash",
		Tiles = { rgb(255, 150, 60), rgb(255, 95, 110), rgb(255, 205, 70), rgb(225, 80, 190) },
		Material = Enum.Material.SmoothPlastic,
		Dirt = rgb(120, 60, 70),
		ClockTime = 17.7,
		Brightness = 2.2,
		Ambient = rgb(140, 100, 110),
		Outdoor = rgb(180, 130, 140),
		AtmosphereColor = rgb(255, 190, 150),
		AtmosphereDecay = rgb(230, 90, 120),
		Haze = 2,
		CloudColor = rgb(255, 185, 165),
		CloudCover = 0.65,
	},
	{
		Name = "Neon Night",
		Tiles = { rgb(0, 240, 255), rgb(255, 40, 200), rgb(140, 255, 60), rgb(255, 220, 40) },
		Material = Enum.Material.SmoothPlastic,
		NeonRings = true,
		Dirt = rgb(40, 30, 70),
		ClockTime = 0.3,
		Brightness = 1.2,
		Ambient = rgb(90, 70, 150),
		Outdoor = rgb(110, 90, 170),
		AtmosphereColor = rgb(80, 60, 150),
		AtmosphereDecay = rgb(40, 20, 100),
		Haze = 1.5,
		CloudColor = rgb(130, 100, 220),
		CloudCover = 0.5,
	},
	{
		Name = "Ocean Breeze",
		Tiles = { rgb(40, 210, 200), rgb(250, 230, 170), rgb(90, 170, 255), rgb(255, 255, 255) },
		Material = Enum.Material.SmoothPlastic,
		Dirt = rgb(150, 120, 90),
		ClockTime = 11.5,
		Brightness = 2.8,
		Ambient = rgb(110, 130, 140),
		Outdoor = rgb(160, 185, 195),
		AtmosphereColor = rgb(185, 240, 255),
		AtmosphereDecay = rgb(80, 180, 230),
		Haze = 0.8,
		CloudColor = rgb(255, 255, 255),
		CloudCover = 0.55,
	},
} :: { Theme }

-- Arena state -----------------------------------------------------------------------------

type Tile = {
	Model: Model,
	Top: BasePart,
	Position: Vector3, -- centre of the tile's top surface
	Dist: number, -- flat distance from arena centre
	Alive: boolean,
}

local arenaFolder: Folder? = nil
local tiles: { Tile } = {}
local rng = Random.new()
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Include
local currentTheme: Theme = ArenaService.Themes[1]

local function makePart(props: { [string]: any }): Part
	local part = Instance.new("Part")
	part.Anchored = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	local parent = props.Parent
	for key, value in props do
		if key ~= "Parent" then
			(part :: any)[key] = value
		end
	end
	if parent then
		part.Parent = parent
	end
	return part
end

local function makeSign(part: BasePart, face: Enum.NormalId, lines: { { Text: string, Size: number, Color: Color3 } })
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 20
	gui.LightInfluence = 0
	gui.Parent = part

	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Vertical
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	layout.VerticalAlignment = Enum.VerticalAlignment.Center
	layout.Padding = UDim.new(0, 6)
	layout.Parent = gui

	for index, line in lines do
		local label = Instance.new("TextLabel")
		label.LayoutOrder = index
		label.BackgroundTransparency = 1
		label.Size = UDim2.new(0.94, 0, line.Size, 0)
		label.Font = if index == 1 then Enum.Font.FredokaOne else Enum.Font.GothamBold
		label.TextScaled = true
		label.TextColor3 = line.Color
		label.TextStrokeTransparency = 0.3
		label.Text = line.Text
		label.Parent = gui
	end
end

-- Arena shapes: predicates over flat offsets from the centre.
local SHAPES: { [string]: (number, number, number) -> boolean } = {
	Disc = function(x, z, r)
		return x * x + z * z <= r * r
	end,
	Cross = function(x, z, r)
		local width = r * 0.36
		return (math.abs(x) <= width or math.abs(z) <= width) and math.max(math.abs(x), math.abs(z)) <= r
	end,
	Donut = function(x, z, r)
		local d = math.sqrt(x * x + z * z)
		return d <= r and d >= r * 0.32
	end,
	Twin = function(x, z, r)
		local islandR = r * 0.48
		local left, right = x + r * 0.5, x - r * 0.5
		return left * left + z * z <= islandR * islandR
			or right * right + z * z <= islandR * islandR
			or (math.abs(z) <= 4 and math.abs(x) <= r * 0.5)
	end,
}

ArenaService.ShapeNames = { "Disc", "Cross", "Donut", "Twin" }
ArenaService.ShapeTitles = {
	Disc = "The Disc",
	Cross = "Crossroads",
	Donut = "Donut Hole",
	Twin = "Twin Isles",
}

-- Sky & lighting ---------------------------------------------------------------------------

local function ensure(className: string, parent: Instance, name: string?): any
	local existing = if name then parent:FindFirstChild(name) else parent:FindFirstChildOfClass(className)
	if existing then
		return existing
	end
	local created = Instance.new(className)
	if name then
		created.Name = name
	end
	created.Parent = parent
	return created
end

local function setupSky()
	-- Keep any Sky you've added yourself (e.g. a skybox from the Toolbox).
	local sky = Lighting:FindFirstChildOfClass("Sky")
	if not sky then
		sky = Instance.new("Sky")
		sky.Parent = Lighting
	end
	sky.CelestialBodiesShown = true
	sky.StarCount = 4000
	sky.SunAngularSize = 16
	sky.MoonAngularSize = 12

	local clouds = ensure("Clouds", Workspace.Terrain)
	clouds.Cover = 0.6
	clouds.Density = 0.7

	local bloom = ensure("BloomEffect", Lighting, "LP_Bloom")
	bloom.Intensity = 0.8
	bloom.Size = 28
	bloom.Threshold = 1.4

	local color = ensure("ColorCorrectionEffect", Lighting, "LP_Color")
	color.Saturation = 0.3
	color.Contrast = 0.08

	local rays = ensure("SunRaysEffect", Lighting, "LP_SunRays")
	rays.Intensity = 0.1
	rays.Spread = 0.7

	ensure("Atmosphere", Lighting)
	Lighting.GlobalShadows = true
end

function ArenaService.ApplyTheme(theme: Theme, instant: boolean?)
	currentTheme = theme
	local info = TweenInfo.new(if instant then 0 else 2.5, Enum.EasingStyle.Sine)
	local function tween(instance: Instance, goals: { [string]: any })
		if instant then
			for key, value in goals do
				(instance :: any)[key] = value
			end
		else
			TweenService:Create(instance, info, goals):Play()
		end
	end

	-- ClockTime wraps at 24, so jump directly instead of tweening across midnight.
	Lighting.ClockTime = theme.ClockTime
	tween(Lighting, {
		Brightness = theme.Brightness,
		Ambient = theme.Ambient,
		OutdoorAmbient = theme.Outdoor,
	})
	local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
	if atmosphere then
		atmosphere.Density = 0.3
		atmosphere.Offset = 0.15
		atmosphere.Glare = 0.3
		tween(atmosphere, { Color = theme.AtmosphereColor, Decay = theme.AtmosphereDecay, Haze = theme.Haze })
	end
	local clouds = Workspace.Terrain:FindFirstChildOfClass("Clouds")
	if clouds then
		tween(clouds, { Color = theme.CloudColor, Cover = theme.CloudCover })
	end
end

function ArenaService.PickTheme(round: number): Theme
	if round == 1 then
		return ArenaService.Themes[1]
	end
	local options = {}
	for _, theme in ArenaService.Themes do
		if theme ~= currentTheme then
			table.insert(options, theme)
		end
	end
	return options[rng:NextInteger(1, #options)]
end

-- Scenery & lobby -----------------------------------------------------------------------------

local FOLIAGE = { rgb(255, 150, 200), rgb(120, 220, 110), rgb(255, 190, 70), rgb(180, 140, 255), rgb(90, 220, 220) }
local PARTY = { rgb(255, 90, 120), rgb(255, 200, 60), rgb(90, 220, 140), rgb(80, 170, 255), rgb(190, 110, 255), rgb(255, 140, 60) }

local function buildScenery()
	local folder = Instance.new("Folder")
	folder.Name = "Scenery"

	-- A cloud layer far below so the void looks bottomless.
	makePart({
		Name = "CloudSea",
		Size = Vector3.new(2048, 1, 2048),
		CFrame = CFrame.new(ARENA.Center - Vector3.new(0, 70, 0)),
		Color = rgb(250, 248, 255),
		Material = Enum.Material.SmoothPlastic,
		Transparency = 0.25,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
		CastShadow = false,
		Parent = folder,
	})

	-- Distant floating islands for depth.
	for i = 1, 11 do
		local angle = (i / 11) * math.pi * 2 + rng:NextNumber(-0.25, 0.25)
		local distance = rng:NextNumber(115, 200)
		local width = rng:NextNumber(10, 26)
		local base = ARENA.Center + Vector3.new(math.cos(angle) * distance, rng:NextNumber(-30, 40), math.sin(angle) * distance)
		makePart({
			Name = "IslandTop",
			Size = Vector3.new(width, 3, width * rng:NextNumber(0.7, 1.2)),
			CFrame = CFrame.new(base) * CFrame.Angles(0, rng:NextNumber(0, math.pi), 0),
			Color = rgb(120, 220, 100),
			Material = Enum.Material.Grass,
			Parent = folder,
		})
		makePart({
			Name = "IslandRock",
			Size = Vector3.new(width * 0.7, width * 0.6, width * 0.7),
			CFrame = CFrame.new(base - Vector3.new(0, 1.5 + width * 0.3, 0)) * CFrame.Angles(0, rng:NextNumber(0, math.pi), 0),
			Color = rgb(140, 100, 75),
			Material = Enum.Material.Rock,
			Parent = folder,
		})
		for _ = 1, rng:NextInteger(1, 3) do
			local trunkHeight = rng:NextNumber(5, 9)
			local spot = base + Vector3.new(rng:NextNumber(-width / 3, width / 3), 1.5, rng:NextNumber(-width / 4, width / 4))
			makePart({
				Name = "Trunk",
				Size = Vector3.new(1.4, trunkHeight, 1.4),
				CFrame = CFrame.new(spot + Vector3.new(0, trunkHeight / 2, 0)),
				Color = rgb(115, 80, 55),
				Material = Enum.Material.Wood,
				Parent = folder,
			})
			makePart({
				Name = "Leaves",
				Shape = Enum.PartType.Ball,
				Size = Vector3.one * rng:NextNumber(6, 10),
				CFrame = CFrame.new(spot + Vector3.new(0, trunkHeight + 1.5, 0)),
				Color = FOLIAGE[rng:NextInteger(1, #FOLIAGE)],
				Material = Enum.Material.SmoothPlastic,
				Parent = folder,
			})
		end
	end

	folder.Parent = Workspace
end

local function balloon(folder: Folder, position: Vector3)
	local color = PARTY[rng:NextInteger(1, #PARTY)]
	local ball = makePart({
		Name = "Balloon",
		Shape = Enum.PartType.Ball,
		Size = Vector3.one * 3,
		CFrame = CFrame.new(position),
		Color = color,
		Material = Enum.Material.SmoothPlastic,
		Reflectance = 0.15,
		CanCollide = false,
		CanQuery = false,
		CastShadow = false,
		Parent = folder,
	})
	local stringPart = makePart({
		Name = "String",
		Size = Vector3.new(0.08, 6, 0.08),
		CFrame = CFrame.new(position - Vector3.new(0, 4.5, 0)),
		Color = rgb(240, 240, 240),
		CanCollide = false,
		CanQuery = false,
		CastShadow = false,
		Parent = ball,
	})
	-- Gentle bobbing; the string moves with the balloon.
	local bob = TweenInfo.new(rng:NextNumber(1.8, 2.8), Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)
	local lift = Vector3.new(0, 1.2, 0)
	TweenService:Create(ball, bob, { CFrame = ball.CFrame + lift }):Play()
	TweenService:Create(stringPart, bob, { CFrame = stringPart.CFrame + lift }):Play()
end

local function buildLobby()
	local folder = Instance.new("Folder")
	folder.Name = "Lobby"
	local c = LOBBY.Center
	local size = LOBBY.Size
	local halfX, halfZ = size.X / 2, size.Z / 2

	-- Rainbow striped floor.
	local stripes = 8
	local stripeWidth = size.X / stripes
	local floorColors = {
		rgb(255, 120, 150), rgb(255, 170, 90), rgb(255, 225, 100), rgb(130, 225, 120),
		rgb(90, 210, 220), rgb(110, 160, 255), rgb(170, 130, 255), rgb(240, 130, 230),
	}
	for i = 1, stripes do
		makePart({
			Name = "Floor",
			Size = Vector3.new(stripeWidth, size.Y, size.Z),
			CFrame = CFrame.new(c.X - halfX + stripeWidth * (i - 0.5), c.Y - size.Y / 2, c.Z),
			Color = floorColors[i],
			Material = Enum.Material.SmoothPlastic,
			Parent = folder,
		})
	end
	makePart({
		Name = "Trim",
		Size = Vector3.new(size.X, 0.3, 1),
		CFrame = CFrame.new(c.X, c.Y + 0.05, c.Z - halfZ + 0.5),
		Color = rgb(255, 255, 255),
		Material = Enum.Material.Neon,
		CanCollide = false,
		Parent = folder,
	})
	makePart({
		Name = "BalconyGlass",
		Size = Vector3.new(size.X, 3.5, 0.5),
		CFrame = CFrame.new(c.X, c.Y + 1.75, c.Z - halfZ),
		Color = rgb(170, 220, 255),
		Material = Enum.Material.Glass,
		Transparency = 0.55,
		Parent = folder,
	})

	-- Corner pillars with glowing caps.
	for index, corner in { Vector3.new(-1, 0, -1), Vector3.new(1, 0, -1), Vector3.new(-1, 0, 1), Vector3.new(1, 0, 1) } do
		local base = c + Vector3.new(corner.X * (halfX - 2), 0, corner.Z * (halfZ - 2))
		makePart({
			Name = "Pillar",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(14, 3, 3),
			CFrame = CFrame.new(base + Vector3.new(0, 7, 0)) * CFrame.Angles(0, 0, math.rad(90)),
			Color = rgb(250, 250, 255),
			Material = Enum.Material.SmoothPlastic,
			Parent = folder,
		})
		makePart({
			Name = "PillarCap",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * 4,
			CFrame = CFrame.new(base + Vector3.new(0, 15, 0)),
			Color = PARTY[index],
			Material = Enum.Material.Neon,
			Parent = folder,
		})
	end

	-- Balloon bunches along the back and sides.
	for _, spot in {
		Vector3.new(-halfX + 6, 9, halfZ - 6),
		Vector3.new(halfX - 6, 9, halfZ - 6),
		Vector3.new(-halfX + 4, 9, 0),
		Vector3.new(halfX - 4, 9, 0),
	} do
		for _ = 1, 3 do
			balloon(folder, c + spot + Vector3.new(rng:NextNumber(-2, 2), rng:NextNumber(0, 3), rng:NextNumber(-2, 2)))
		end
	end

	-- Invisible walls so nobody can leave the lobby (or get launched out of it).
	local wallHeight = 45
	local walls = {
		{ Vector3.new(size.X, wallHeight, 1), Vector3.new(0, wallHeight / 2, -halfZ - 0.5) },
		{ Vector3.new(size.X, wallHeight, 1), Vector3.new(0, wallHeight / 2, halfZ + 0.5) },
		{ Vector3.new(1, wallHeight, size.Z), Vector3.new(-halfX - 0.5, wallHeight / 2, 0) },
		{ Vector3.new(1, wallHeight, size.Z), Vector3.new(halfX + 0.5, wallHeight / 2, 0) },
		{ Vector3.new(size.X, 1, size.Z), Vector3.new(0, wallHeight, 0) },
	}
	for index, wall in walls do
		makePart({
			Name = "Barrier" .. index,
			Size = wall[1],
			CFrame = CFrame.new(c + wall[2]),
			Transparency = 1,
			CanQuery = false,
			CastShadow = false,
			Parent = folder,
		})
	end

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "LobbySpawn"
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Size = Vector3.new(14, 1, 14)
	spawn.CFrame = CFrame.new(c + Vector3.new(0, 0.5, 9)) -- default orientation faces -Z, toward the arena
	spawn.Color = rgb(255, 255, 255)
	spawn.Material = Enum.Material.SmoothPlastic
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = folder

	local signColor = rgb(35, 25, 70)
	local title = makePart({
		Name = "TitleSign",
		Size = Vector3.new(60, 18, 1),
		CFrame = CFrame.new(c.X, c.Y + 13, c.Z + halfZ - 0.5),
		Color = signColor,
		Material = Enum.Material.SmoothPlastic,
		Parent = folder,
	})
	makeSign(title, Enum.NormalId.Front, {
		{ Text = Config.GameName, Size = 0.55, Color = rgb(255, 210, 60) },
		{ Text = "punch people off the island. last one standing wins.", Size = 0.16, Color = rgb(255, 255, 255) },
	})

	local howTo = makePart({
		Name = "HowToBoard",
		Size = Vector3.new(30, 16, 1),
		CFrame = CFrame.new(c.X - halfX + 0.5, c.Y + 9, c.Z + 2) * CFrame.Angles(0, -math.pi / 2, 0),
		Color = signColor,
		Parent = folder,
	})
	makeSign(howTo, Enum.NormalId.Front, {
		{ Text = "HOW TO PLAY", Size = 0.2, Color = rgb(90, 230, 255) },
		{ Text = "Click to punch", Size = 0.1, Color = rgb(255, 255, 255) },
		{ Text = "Hold click for a big punch", Size = 0.1, Color = rgb(255, 255, 255) },
		{ Text = "Q or Shift to dash (works in the air too)", Size = 0.1, Color = rgb(255, 255, 255) },
		{ Text = "The higher your %, the further you fly", Size = 0.1, Color = rgb(255, 200, 80) },
		{ Text = "Fall off and you're out", Size = 0.1, Color = rgb(255, 130, 130) },
	})

	local draftBoard = makePart({
		Name = "DraftBoard",
		Size = Vector3.new(30, 16, 1),
		CFrame = CFrame.new(c.X + halfX - 0.5, c.Y + 9, c.Z + 2) * CFrame.Angles(0, math.pi / 2, 0),
		Color = signColor,
		Parent = folder,
	})
	makeSign(draftBoard, Enum.NormalId.Front, {
		{ Text = "BETWEEN ROUNDS", Size = 0.2, Color = rgb(255, 184, 40) },
		{ Text = "You pick a perk card", Size = 0.1, Color = rgb(255, 255, 255) },
		{ Text = "Perks stack until the match ends", Size = 0.1, Color = rgb(255, 255, 255) },
		{ Text = "Did bad last round? You get better cards", Size = 0.1, Color = rgb(255, 255, 255) },
		{ Text = "Whoever's winning wears the crown 👑", Size = 0.1, Color = rgb(255, 220, 90) },
		{ Text = "Knock them out for a bonus point", Size = 0.1, Color = rgb(140, 255, 90) },
	})

	folder.Parent = Workspace
end

function ArenaService.SetupWorld()
	setupSky()
	ArenaService.ApplyTheme(ArenaService.Themes[1], true)
	buildScenery()
	buildLobby()
	Workspace.Gravity = Config.Events.DefaultGravity
end

-- Arena -----------------------------------------------------------------------------------------

function ArenaService.Clear()
	if arenaFolder then
		arenaFolder:Destroy()
		arenaFolder = nil
	end
	table.clear(tiles)
end

function ArenaService.Build(shapeName: string, theme: Theme?)
	ArenaService.Clear()
	theme = theme or currentTheme
	local palette = (theme :: Theme).Tiles
	local shape = SHAPES[shapeName] or SHAPES.Disc
	local folder = Instance.new("Folder")
	folder.Name = "Arena"
	rayParams.FilterDescendantsInstances = { folder }

	local tileSize = ARENA.TileSize
	local n = math.ceil(ARENA.Radius / tileSize)
	local center = ARENA.Center

	for gx = -n, n do
		for gz = -n, n do
			local x, z = gx * tileSize, gz * tileSize
			if shape(x, z, ARENA.Radius) then
				local dist = math.sqrt(x * x + z * z)
				-- Concentric color rings: pretty, and they show which ring crumbles next.
				local ring = math.floor(dist / tileSize + 0.5)
				local color = palette[ring % #palette + 1]
				local material = (theme :: Theme).Material
				if (theme :: Theme).NeonRings then
					if ring % 2 == 0 then
						material = Enum.Material.Neon
					else
						color = color:Lerp(Color3.new(0, 0, 0), 0.75)
					end
				end
				if (gx + gz) % 2 == 0 then
					color = color:Lerp(Color3.new(1, 1, 1), 0.12)
				end

				local model = Instance.new("Model")
				model.Name = "Tile"
				local top = makePart({
					Name = "Top",
					Size = Vector3.new(tileSize, 1.4, tileSize),
					CFrame = CFrame.new(center + Vector3.new(x, -0.7, z)),
					Color = color,
					Material = material,
					Parent = model,
				})
				local depth = 3 + rng:NextNumber() * 4
				local dirt = makePart({
					Name = "Dirt",
					Anchored = false,
					Massless = true,
					Size = Vector3.new(tileSize - 0.5, depth, tileSize - 0.5),
					CFrame = CFrame.new(center + Vector3.new(x, -1.4 - depth / 2, z)),
					Color = (theme :: Theme).Dirt:Lerp(Color3.new(0, 0, 0), rng:NextNumber() * 0.15),
					Material = Enum.Material.Ground,
					Parent = model,
				})
				local weld = Instance.new("WeldConstraint")
				weld.Part0 = top
				weld.Part1 = dirt
				weld.Parent = top
				model.PrimaryPart = top
				model.Parent = folder

				table.insert(tiles, {
					Model = model,
					Top = top,
					Position = center + Vector3.new(x, 0, z),
					Dist = dist,
					Alive = true,
				})
			end
		end
	end

	folder.Parent = Workspace
	arenaFolder = folder
end

function ArenaService.AliveTileCount(): number
	local count = 0
	for _, tile in tiles do
		if tile.Alive then
			count += 1
		end
	end
	return count
end

-- Evenly spaced spawn points around the arena, all facing the centre.
function ArenaService.GetSpawnCFrames(count: number): { CFrame }
	local center = ARENA.Center
	local used: { [Tile]: boolean } = {}
	local result = {}
	local ringRadius = ARENA.Radius * 0.55
	local offset = rng:NextNumber() * math.pi * 2

	for i = 1, count do
		local angle = offset + (i - 1) / count * math.pi * 2
		local target = center + Vector3.new(math.cos(angle) * ringRadius, 0, math.sin(angle) * ringRadius)
		local best: Tile? = nil
		local bestDist = math.huge
		for _, tile in tiles do
			if tile.Alive and not used[tile] then
				local d = (tile.Position - target).Magnitude
				if d < bestDist then
					best, bestDist = tile, d
				end
			end
		end
		local position = center
		if best then
			used[best] = true
			position = best.Position
		end
		local spawnPos = position + Vector3.new(0, 4, 0)
		local lookAt = Vector3.new(center.X, spawnPos.Y, center.Z)
		if (lookAt - spawnPos).Magnitude < 0.5 then
			lookAt = spawnPos + Vector3.new(0, 0, -1)
		end
		table.insert(result, CFrame.lookAt(spawnPos, lookAt))
	end
	return result
end

-- The most central surviving tile; used by Second Wind.
function ArenaService.GetSafeCFrame(): CFrame
	local best: Tile? = nil
	for _, tile in tiles do
		if tile.Alive and (not best or tile.Dist < best.Dist) then
			best = tile
		end
	end
	local position = if best then best.Position else ARENA.Center
	return CFrame.new(position + Vector3.new(0, 6, 0))
end

function ArenaService.RandomTilePosition(): Vector3?
	local alive = {}
	for _, tile in tiles do
		if tile.Alive then
			table.insert(alive, tile)
		end
	end
	if #alive == 0 then
		return nil
	end
	return alive[rng:NextInteger(1, #alive)].Position
end

-- True if there is solid, non-crumbling floor beneath `position`.
function ArenaService.IsOverArena(position: Vector3): boolean
	if not arenaFolder then
		return false
	end
	local result = Workspace:Raycast(position + Vector3.new(0, 2, 0), Vector3.new(0, -60, 0), rayParams)
	if not result then
		return false
	end
	local model = result.Instance.Parent
	return model ~= nil and model:IsA("Model") and not model:GetAttribute("Crumbling")
end

local function crumble(tile: Tile, warnTime: number)
	if not tile.Alive then
		return
	end
	tile.Alive = false
	tile.Model:SetAttribute("Crumbling", true)
	local top = tile.Top
	TweenService:Create(top, TweenInfo.new(warnTime), { Color = WARN }):Play()

	task.spawn(function()
		local base = top.CFrame
		local started = os.clock()
		while top.Parent and os.clock() - started < warnTime do
			local intensity = 0.05 + 0.2 * ((os.clock() - started) / warnTime)
			top.CFrame = base
				* CFrame.new(rng:NextNumber(-intensity, intensity), 0, rng:NextNumber(-intensity, intensity))
			task.wait(0.05)
		end
		if top.Parent then
			top.CFrame = base
			top.Anchored = false
			top.AssemblyLinearVelocity = Vector3.new(0, -6, 0)
			top.AssemblyAngularVelocity = Vector3.new(rng:NextNumber(-1, 1), 0, rng:NextNumber(-1, 1))
			Debris:AddItem(tile.Model, 5)
		end
	end)
end

-- Sudden death: drop the outermost ring of tiles. Returns false once the arena can't shrink further.
function ArenaService.CrumbleStep(): boolean
	local alive = {}
	for _, tile in tiles do
		if tile.Alive then
			table.insert(alive, tile)
		end
	end
	if #alive <= ARENA.MinTiles then
		return false
	end
	table.sort(alive, function(a, b)
		return a.Dist > b.Dist
	end)
	local cutoff = alive[1].Dist - ARENA.TileSize * 0.6
	local maxRemove = #alive - ARENA.MinTiles
	local removed = 0
	for _, tile in alive do
		if tile.Dist < cutoff or removed >= maxRemove then
			break
		end
		crumble(tile, 1.4)
		removed += 1
	end
	return removed > 0
end

-- Knock out tiles around an impact (meteors). Never drops below MinTiles.
function ArenaService.BreakTilesNear(position: Vector3, radius: number)
	local budget = ArenaService.AliveTileCount() - ARENA.MinTiles
	for _, tile in tiles do
		if budget <= 0 then
			return
		end
		local offset = tile.Position - position
		if tile.Alive and Vector3.new(offset.X, 0, offset.Z).Magnitude <= radius then
			crumble(tile, 0.35)
			budget -= 1
		end
	end
end

function ArenaService.SetIce(enabled: boolean)
	for _, tile in tiles do
		if tile.Alive and tile.Top.Parent then
			if enabled then
				tile.Top.Material = Enum.Material.Ice
				tile.Top.Color = tile.Top.Color:Lerp(ICE, 0.6)
				tile.Top.CustomPhysicalProperties = PhysicalProperties.new(0.9, 0, 0, 100, 1)
			else
				tile.Top.CustomPhysicalProperties = nil
			end
		end
	end
end

function ArenaService.GetCenter(): Vector3
	return ARENA.Center
end

function ArenaService.GetVoidY(): number
	return ARENA.Center.Y - ARENA.VoidDepth
end

function ArenaService.GetLobbyVoidY(): number
	return LOBBY.Center.Y - LOBBY.VoidDepth
end

function ArenaService.GetLobbySpawnCFrame(): CFrame
	return CFrame.new(LOBBY.Center + Vector3.new(0, 4, 9))
end

return ArenaService
