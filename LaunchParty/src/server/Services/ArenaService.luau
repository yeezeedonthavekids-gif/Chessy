-- Builds the world: lighting, the spectator lobby and a fresh floating-island arena every round.
local Debris = game:GetService("Debris")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)

local ArenaService = {}

local ARENA = Config.Arena
local LOBBY = Config.Lobby

local GRASS_A = Color3.fromRGB(116, 206, 92)
local GRASS_B = Color3.fromRGB(98, 186, 80)
local DIRT = Color3.fromRGB(126, 88, 62)
local WARN = Color3.fromRGB(255, 96, 64)
local ICE = Color3.fromRGB(190, 230, 255)

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

local function setupLighting()
	Lighting.ClockTime = 14.5
	Lighting.Brightness = 2.2
	Lighting.Ambient = Color3.fromRGB(95, 95, 115)
	Lighting.OutdoorAmbient = Color3.fromRGB(150, 150, 172)
	Lighting.GlobalShadows = true

	local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")
	atmosphere.Density = 0.32
	atmosphere.Offset = 0.15
	atmosphere.Color = Color3.fromRGB(198, 220, 255)
	atmosphere.Decay = Color3.fromRGB(110, 150, 210)
	atmosphere.Glare = 0.2
	atmosphere.Haze = 1.2
	atmosphere.Parent = Lighting

	if not Lighting:FindFirstChild("LP_Bloom") then
		local bloom = Instance.new("BloomEffect")
		bloom.Name = "LP_Bloom"
		bloom.Intensity = 0.6
		bloom.Size = 24
		bloom.Threshold = 1.6
		bloom.Parent = Lighting
	end
	if not Lighting:FindFirstChild("LP_Color") then
		local color = Instance.new("ColorCorrectionEffect")
		color.Name = "LP_Color"
		color.Saturation = 0.15
		color.Contrast = 0.05
		color.Parent = Lighting
	end
end

local function buildScenery()
	local folder = Instance.new("Folder")
	folder.Name = "Scenery"

	-- A cloud sea far below the arena so the void reads as "very, very far down".
	makePart({
		Name = "CloudSea",
		Size = Vector3.new(2048, 1, 2048),
		CFrame = CFrame.new(ARENA.Center - Vector3.new(0, 70, 0)),
		Color = Color3.fromRGB(245, 248, 255),
		Material = Enum.Material.SmoothPlastic,
		Transparency = 0.25,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
		CastShadow = false,
		Parent = folder,
	})

	-- Distant floating islands for depth.
	for i = 1, 9 do
		local angle = (i / 9) * math.pi * 2 + rng:NextNumber(-0.25, 0.25)
		local distance = rng:NextNumber(115, 190)
		local width = rng:NextNumber(10, 24)
		local base = ARENA.Center + Vector3.new(math.cos(angle) * distance, rng:NextNumber(-30, 35), math.sin(angle) * distance)
		makePart({
			Name = "IslandTop",
			Size = Vector3.new(width, 3, width * rng:NextNumber(0.7, 1.2)),
			CFrame = CFrame.new(base) * CFrame.Angles(0, rng:NextNumber(0, math.pi), 0),
			Color = GRASS_A,
			Material = Enum.Material.Grass,
			Parent = folder,
		})
		makePart({
			Name = "IslandRock",
			Size = Vector3.new(width * 0.7, width * 0.6, width * 0.7),
			CFrame = CFrame.new(base - Vector3.new(0, 1.5 + width * 0.3, 0)) * CFrame.Angles(0, rng:NextNumber(0, math.pi), 0),
			Color = DIRT,
			Material = Enum.Material.Rock,
			Parent = folder,
		})
		if rng:NextNumber() < 0.7 then
			local trunkHeight = rng:NextNumber(5, 9)
			makePart({
				Name = "Trunk",
				Size = Vector3.new(1.4, trunkHeight, 1.4),
				CFrame = CFrame.new(base + Vector3.new(0, 1.5 + trunkHeight / 2, 0)),
				Color = Color3.fromRGB(110, 76, 50),
				Material = Enum.Material.Wood,
				Parent = folder,
			})
			makePart({
				Name = "Leaves",
				Shape = Enum.PartType.Ball,
				Size = Vector3.one * rng:NextNumber(6, 9),
				CFrame = CFrame.new(base + Vector3.new(0, 1.5 + trunkHeight + 1.5, 0)),
				Color = Color3.fromRGB(70, 170, 80),
				Material = Enum.Material.Grass,
				Parent = folder,
			})
		end
	end

	folder.Parent = Workspace
end

local function buildLobby()
	local folder = Instance.new("Folder")
	folder.Name = "Lobby"
	local c = LOBBY.Center
	local size = LOBBY.Size
	local halfX, halfZ = size.X / 2, size.Z / 2

	makePart({
		Name = "Floor",
		Size = size,
		CFrame = CFrame.new(c - Vector3.new(0, size.Y / 2, 0)),
		Color = Color3.fromRGB(58, 62, 84),
		Material = Enum.Material.Slate,
		Parent = folder,
	})
	-- Neon trim along the balcony edge facing the arena.
	makePart({
		Name = "Trim",
		Size = Vector3.new(size.X, 0.3, 1),
		CFrame = CFrame.new(c.X, c.Y + 0.05, c.Z - halfZ + 0.5),
		Color = Color3.fromRGB(255, 200, 60),
		Material = Enum.Material.Neon,
		CanCollide = false,
		Parent = folder,
	})
	makePart({
		Name = "BalconyGlass",
		Size = Vector3.new(size.X, 3.5, 0.5),
		CFrame = CFrame.new(c.X, c.Y + 1.75, c.Z - halfZ),
		Color = Color3.fromRGB(170, 220, 255),
		Material = Enum.Material.Glass,
		Transparency = 0.55,
		Parent = folder,
	})

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
	spawn.Color = Color3.fromRGB(255, 200, 60)
	spawn.Material = Enum.Material.SmoothPlastic
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = folder

	local title = makePart({
		Name = "TitleSign",
		Size = Vector3.new(60, 18, 1),
		CFrame = CFrame.new(c.X, c.Y + 13, c.Z + halfZ - 0.5),
		Color = Color3.fromRGB(30, 32, 48),
		Material = Enum.Material.SmoothPlastic,
		Parent = folder,
	})
	makeSign(title, Enum.NormalId.Front, {
		{ Text = Config.GameName, Size = 0.55, Color = Color3.fromRGB(255, 205, 60) },
		{ Text = "Build heat. Launch friends. Don't be the one who falls.", Size = 0.16, Color = Color3.new(1, 1, 1) },
	})

	local howTo = makePart({
		Name = "HowToBoard",
		Size = Vector3.new(30, 16, 1),
		CFrame = CFrame.new(c.X - halfX + 0.5, c.Y + 9, c.Z + 2) * CFrame.Angles(0, -math.pi / 2, 0),
		Color = Color3.fromRGB(30, 32, 48),
		Parent = folder,
	})
	makeSign(howTo, Enum.NormalId.Front, {
		{ Text = "HOW TO PLAY", Size = 0.2, Color = Color3.fromRGB(90, 230, 255) },
		{ Text = "CLICK to punch.  HOLD to charge a launcher.", Size = 0.1, Color = Color3.new(1, 1, 1) },
		{ Text = "Q / SHIFT to dash. Works in mid-air!", Size = 0.1, Color = Color3.new(1, 1, 1) },
		{ Text = "Hits raise HEAT. More heat = you fly further.", Size = 0.1, Color = Color3.fromRGB(255, 200, 80) },
		{ Text = "Fall into the void and you're out.", Size = 0.1, Color = Color3.fromRGB(255, 120, 120) },
		{ Text = "Last one standing wins the round.", Size = 0.1, Color = Color3.new(1, 1, 1) },
	})

	local draftBoard = makePart({
		Name = "DraftBoard",
		Size = Vector3.new(30, 16, 1),
		CFrame = CFrame.new(c.X + halfX - 0.5, c.Y + 9, c.Z + 2) * CFrame.Angles(0, math.pi / 2, 0),
		Color = Color3.fromRGB(30, 32, 48),
		Parent = folder,
	})
	makeSign(draftBoard, Enum.NormalId.Front, {
		{ Text = "THE DRAFT", Size = 0.2, Color = Color3.fromRGB(255, 184, 40) },
		{ Text = "After each round, pick 1 of 3 perks. They stack!", Size = 0.1, Color = Color3.new(1, 1, 1) },
		{ Text = "Placed low? You get luckier cards.", Size = 0.1, Color = Color3.new(1, 1, 1) },
		{ Text = "The leader wears the crown. KO them for a bounty.", Size = 0.1, Color = Color3.fromRGB(255, 220, 90) },
		{ Text = "Level up to unlock new perks, titles & trails.", Size = 0.1, Color = Color3.fromRGB(140, 255, 90) },
		{ Text = "Punch the dummies while you wait!", Size = 0.1, Color = Color3.new(1, 1, 1) },
	})

	folder.Parent = Workspace
end

function ArenaService.SetupWorld()
	setupLighting()
	buildScenery()
	buildLobby()
	Workspace.Gravity = Config.Events.DefaultGravity
end

function ArenaService.Clear()
	if arenaFolder then
		arenaFolder:Destroy()
		arenaFolder = nil
	end
	table.clear(tiles)
end

function ArenaService.Build(shapeName: string)
	ArenaService.Clear()
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
				local model = Instance.new("Model")
				model.Name = "Tile"
				local top = makePart({
					Name = "Top",
					Size = Vector3.new(tileSize, 1.4, tileSize),
					CFrame = CFrame.new(center + Vector3.new(x, -0.7, z)),
					Color = if (gx + gz) % 2 == 0 then GRASS_A else GRASS_B,
					Material = Enum.Material.Grass,
					Parent = model,
				})
				local depth = 3 + rng:NextNumber() * 4
				local dirt = makePart({
					Name = "Dirt",
					Anchored = false,
					Massless = true,
					Size = Vector3.new(tileSize - 0.5, depth, tileSize - 0.5),
					CFrame = CFrame.new(center + Vector3.new(x, -1.4 - depth / 2, z)),
					Color = DIRT:Lerp(Color3.new(0, 0, 0), rng:NextNumber() * 0.15),
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
					Dist = math.sqrt(x * x + z * z),
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
				tile.Top.Color = tile.Top.Color:Lerp(ICE, 0.75)
				tile.Top.CustomPhysicalProperties = PhysicalProperties.new(0.9, 0, 0, 100, 1)
			else
				tile.Top.Material = Enum.Material.Grass
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
