-- Between rounds every fighter picks 1 of 3 perk cards. Low placers get luckier rolls.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage.Shared
local Draft = require(Shared.Draft)
local Net = require(Shared.Net)
local Perks = require(Shared.Perks)

local DataService = require(script.Parent.DataService)
local FighterService = require(script.Parent.FighterService)

type Fighter = FighterService.Fighter

local DraftService = {}

local offerRemote = Net.Event("DraftOffer")
local closeRemote = Net.Event("DraftClose")
local pickRemote = Net.Event("DraftPick")
local feedRemote = Net.Event("KillFeed")

local rng = Random.new()

type Pending = {
	Fighter: Fighter,
	Cards: { Perks.PerkDef },
	Picked: boolean,
	Pool: { Perks.PerkDef },
	Luck: number,
	CanReroll: boolean,
	EndsAt: number,
}
local pendingByPlayer: { [Player]: Pending } = {}

local function serialize(fighter: Fighter, cards: { Perks.PerkDef })
	local list = {}
	for _, def in cards do
		table.insert(list, {
			Id = def.Id,
			Name = def.Name,
			Description = def.Description,
			Rarity = def.Rarity,
			Owned = fighter.Perks[def.Id] or 0,
			MaxStacks = def.MaxStacks,
		})
	end
	return list
end

local function commit(pending: Pending, index: number)
	if pending.Picked then
		return
	end
	local def = pending.Cards[index]
	if not def then
		return
	end
	pending.Picked = true
	FighterService.AddPerk(pending.Fighter, def.Id)
	if def.Rarity == "Legendary" then
		feedRemote:FireAllClients({ Text = string.format("✨ %s got %s!", pending.Fighter.Name, def.Name) })
	end
end

-- Blocks until everyone picks or time runs out (unpicked fighters get a random card).
function DraftService.Run(participants: { Fighter }, luckBy: { [Fighter]: number }, duration: number)
	local endsAt = Workspace:GetServerTimeNow() + duration
	local all: { Pending } = {}

	for _, fighter in participants do
		local level = if fighter.Player then DataService.GetLevel(fighter.Player) else 99
		local pool = Perks.Pool(level)
		local luck = luckBy[fighter] or 0.5
		local cards = Draft.Roll(pool, fighter.Perks, 3, luck, rng) :: { any }
		if #cards > 0 then
			local canReroll = fighter.Player ~= nil and fighter.Player:GetAttribute("Pass_Reroll") == true
			local pending: Pending = {
				Fighter = fighter,
				Cards = cards,
				Picked = false,
				Pool = pool,
				Luck = luck,
				CanReroll = canReroll,
				EndsAt = endsAt,
			}
			table.insert(all, pending)
			if fighter.Player and fighter.Player.Parent then
				pendingByPlayer[fighter.Player] = pending
				offerRemote:FireClient(fighter.Player, serialize(fighter, cards), endsAt, canReroll)
			else
				task.delay(rng:NextNumber(1, 3), function()
					commit(pending, rng:NextInteger(1, #pending.Cards))
				end)
			end
		end
	end

	while Workspace:GetServerTimeNow() < endsAt do
		local waiting = false
		for _, pending in all do
			if not pending.Picked and (not pending.Fighter.Player or pending.Fighter.Player.Parent) then
				waiting = true
				break
			end
		end
		if not waiting then
			break
		end
		task.wait(0.2)
	end

	for _, pending in all do
		if not pending.Picked then
			commit(pending, rng:NextInteger(1, #pending.Cards))
		end
	end
	table.clear(pendingByPlayer)
	closeRemote:FireAllClients()
	task.wait(0.6)
end

function DraftService.Init()
	pickRemote.OnServerEvent:Connect(function(player, index)
		local pending = pendingByPlayer[player]
		if not pending or type(index) ~= "number" or index ~= index then
			return
		end
		index = math.floor(index)
		if index < 1 or index > #pending.Cards then
			return
		end
		commit(pending, index)
	end)

	Net.Event("DraftReroll").OnServerEvent:Connect(function(player)
		local pending = pendingByPlayer[player]
		if not pending or pending.Picked or not pending.CanReroll then
			return
		end
		pending.CanReroll = false
		local cards = Draft.Roll(pending.Pool, pending.Fighter.Perks, 3, pending.Luck, rng) :: { any }
		if #cards > 0 then
			pending.Cards = cards
		end
		offerRemote:FireClient(player, serialize(pending.Fighter, pending.Cards), pending.EndsAt, false)
	end)
end

return DraftService
