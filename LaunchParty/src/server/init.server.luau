-- LAUNCH PARTY server bootstrap. Order matters: world -> data -> systems -> match loop.
local Services = script:WaitForChild("Services")

local ArenaService = require(Services.ArenaService)
local BotService = require(Services.BotService)
local CombatService = require(Services.CombatService)
local DataService = require(Services.DataService)
local DraftService = require(Services.DraftService)
local RoundService = require(Services.RoundService)
local QuestService = require(Services.QuestService)
local ShopService = require(Services.ShopService)

local Config = require(game:GetService("ReplicatedStorage").Shared.Config)

ArenaService.SetupWorld()
DataService.Init()
CombatService.Init()
BotService.Init()
DraftService.Init()
ShopService.Init()
QuestService.Init()
RoundService.Init()

-- Practice dummies in the lobby so there's always something to launch.
local lobby = Config.Lobby.Center
BotService.CreateDummy(CFrame.new(lobby + Vector3.new(-20, 4, -6)) * CFrame.Angles(0, math.rad(180), 0))
BotService.CreateDummy(CFrame.new(lobby + Vector3.new(20, 4, -6)) * CFrame.Angles(0, math.rad(180), 0))

RoundService.Start()
print("[LaunchParty] Server ready.")
