-- Shop: Bonks purchases, equipping skins/trails, game passes and Robux developer products.
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage.Shared
local Net = require(Shared.Net)
local Shop = require(Shared.Shop)

local DataService = require(script.Parent.DataService)
local FighterService = require(script.Parent.FighterService)

type Fighter = FighterService.Fighter

local ShopService = {}

local resultRemote = Net.Event("ShopResult")
local lastAction: { [Player]: number } = {}

local function tell(player: Player, ok: boolean, message: string)
	resultRemote:FireClient(player, ok, message)
end

local function ownsPass(player: Player, key: string): boolean
	return player:GetAttribute("Pass_" .. key) == true
end

local function owns(player: Player, item: any, ownedField: string): boolean
	if item.Pass then
		return ownsPass(player, item.Pass)
	end
	if item.Price == 0 and not item.BundleOnly then
		return true
	end
	local data = DataService.GetData(player)
	return data ~= nil and data[ownedField][item.Id] == true
end

function ShopService.OwnsSkin(player: Player, skin: any): boolean
	return owns(player, skin, "OwnedSkins")
end

function ShopService.OwnsTrail(player: Player, trail: any): boolean
	return owns(player, trail, "OwnedTrails")
end

-- Cosmetics ------------------------------------------------------------------------------

local function applySkin(model: Model, skin: any)
	for _, item in model:GetDescendants() do
		if item:IsA("Shirt") or item:IsA("Pants") or item:IsA("ShirtGraphic") or item:IsA("BodyColors") then
			item:Destroy()
		elseif item:IsA("BasePart") and item.Name ~= "HumanoidRootPart" and not item:FindFirstAncestorOfClass("Accessory") then
			item.Color = skin.Color
			item.Material = skin.Material or Enum.Material.SmoothPlastic
			item.Transparency = skin.Transparency or 0
		end
	end
	local torso = model:FindFirstChild("UpperTorso") or model:FindFirstChild("Torso")
	if not torso then
		return
	end
	local old = torso:FindFirstChild("SkinEffect")
	if old then
		old:Destroy()
	end
	if skin.Effect == "Fire" then
		local fire = Instance.new("Fire")
		fire.Name = "SkinEffect"
		fire.Size = 4
		fire.Heat = 6
		fire.Color = Color3.fromRGB(255, 140, 40)
		fire.SecondaryColor = Color3.fromRGB(255, 60, 20)
		fire.Parent = torso
	elseif skin.Effect == "Sparkles" then
		local sparkles = Instance.new("Sparkles")
		sparkles.Name = "SkinEffect"
		sparkles.SparkleColor = skin.Color:Lerp(Color3.new(1, 1, 1), 0.5)
		sparkles.Parent = torso
	end
end

-- Applies the player's equipped skin and trail to their current character.
function ShopService.ApplyCosmetics(fighter: Fighter)
	local player = fighter.Player
	if not player then
		return
	end
	local data = DataService.GetData(player)
	fighter.VIP = ownsPass(player, "VIP")
	if data then
		local skin = Shop.Find(Shop.Skins, data.EquippedSkin)
		if skin and skin.Color and ShopService.OwnsSkin(player, skin) and fighter.Model then
			applySkin(fighter.Model, skin)
		end
		local trail = Shop.Find(Shop.Trails, data.EquippedTrail)
		fighter.TrailOverride = if trail and trail.Colors and ShopService.OwnsTrail(player, trail) then trail.Colors else nil
	end
	FighterService.RefreshCosmetics(fighter)
end

-- Actions ---------------------------------------------------------------------------------

local function equip(player: Player, kind: string, item: any)
	local data = DataService.GetData(player) :: { [string]: any }
	local fighter = FighterService.GetByPlayer(player)
	if kind == "Skin" then
		data.EquippedSkin = item.Id
		DataService.MarkDirty(player)
		if fighter and fighter.Model then
			if item.Color then
				ShopService.ApplyCosmetics(fighter)
			elseif fighter.Zone == "Lobby" then
				player:LoadCharacter() -- going back to Classic needs a fresh avatar
			else
				tell(player, true, "Classic look comes back next time you spawn.")
				return
			end
		end
	else
		data.EquippedTrail = item.Id
		DataService.MarkDirty(player)
		if fighter then
			ShopService.ApplyCosmetics(fighter)
		end
	end
	tell(player, true, item.Name .. " equipped.")
end

local function buy(player: Player, kind: string, item: any)
	local data = DataService.GetData(player) :: { [string]: any }
	local ownedField = if kind == "Skin" then "OwnedSkins" else "OwnedTrails"
	if owns(player, item, ownedField) then
		equip(player, kind, item)
		return
	end
	if item.Pass then
		tell(player, false, "That one comes with a game pass. Check the Passes tab.")
		return
	end
	if item.BundleOnly then
		tell(player, false, "You can only get that from a bundle.")
		return
	end
	if data.Bonks < item.Price then
		tell(player, false, string.format("You need %d more Bonks. Go launch some people!", item.Price - data.Bonks))
		return
	end
	data.Bonks -= item.Price
	data[ownedField][item.Id] = true
	DataService.MarkDirty(player)
	equip(player, kind, item)
end

local function prompt(player: Player, key: string)
	local pass = Shop.Find(Shop.Passes, key)
	if pass then
		if pass.Id == 0 then
			tell(player, false, pass.Name .. " isn't for sale yet.")
		elseif ownsPass(player, pass.Key) then
			tell(player, false, "You already have " .. pass.Name .. ".")
		else
			MarketplaceService:PromptGamePassPurchase(player, pass.Id)
		end
		return
	end
	local product = Shop.Find(Shop.Products, key) or Shop.Find(Shop.Bundles, key)
	if product then
		local data = DataService.GetData(player) :: { [string]: any }
		if product.Id == 0 then
			tell(player, false, product.Name .. " isn't for sale yet.")
		elseif product.OneTime and data.Bundles[product.Key] then
			tell(player, false, "You already got the " .. product.Name .. ".")
		elseif product.Key == "StarterBundle" and DataService.StarterOfferEndsAt(player) == 0 then
			tell(player, false, "The Starter Bundle offer has ended.")
		else
			MarketplaceService:PromptProductPurchase(player, product.Id)
		end
	end
end

local function onAction(player: Player, action: any, id: any)
	if type(action) ~= "string" or type(id) ~= "string" then
		return
	end
	local now = os.clock()
	if now - (lastAction[player] or 0) < 0.3 then
		return
	end
	lastAction[player] = now
	if not DataService.GetData(player) then
		tell(player, false, "Still loading your stuff, try again in a sec.")
		return
	end

	if action == "BuySkin" or action == "EquipSkin" then
		local skin = Shop.Find(Shop.Skins, id)
		if skin then
			if action == "BuySkin" then
				buy(player, "Skin", skin)
			elseif ShopService.OwnsSkin(player, skin) then
				equip(player, "Skin", skin)
			end
		end
	elseif action == "BuyTrail" or action == "EquipTrail" then
		local trail = Shop.Find(Shop.Trails, id)
		if trail then
			if action == "BuyTrail" then
				buy(player, "Trail", trail)
			elseif ShopService.OwnsTrail(player, trail) then
				equip(player, "Trail", trail)
			end
		end
	elseif action == "Prompt" then
		prompt(player, id)
	end
end

-- Robux --------------------------------------------------------------------------------------

local function grant(player: Player, product: any)
	local data = DataService.GetData(player) :: { [string]: any }
	if product.Bonks then
		data.Bonks += product.Bonks
	end
	for _, skinId in product.Skins or {} do
		data.OwnedSkins[skinId] = true
	end
	for _, trailId in product.Trails or {} do
		data.OwnedTrails[trailId] = true
	end
	if product.OneTime then
		data.Bundles[product.Key] = true
	end
	DataService.MarkDirty(player)
end

local function processReceipt(info)
	local player = Players:GetPlayerByUserId(info.PlayerId)
	if not player or not DataService.IsLoaded(player) then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local purchaseId = tostring(info.PurchaseId)

	if not DataService.HasReceipt(player, purchaseId) then
		local product = Shop.FindProductById(info.ProductId)
		if not product then
			warn("[LaunchParty] Unknown developer product:", info.ProductId)
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end
		grant(player, product)
		DataService.AddReceipt(player, purchaseId)
		tell(player, true, "Thanks! " .. product.Name .. " added.")
	end

	-- Only confirm once it's actually saved; Roblox retries the receipt otherwise.
	if DataService.SaveNow(player) then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	return Enum.ProductPurchaseDecision.NotProcessedYet
end

local function checkPasses(player: Player)
	for _, pass in Shop.Passes do
		if pass.Id ~= 0 then
			local ok, result = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, pass.Id)
			end)
			if ok and result then
				player:SetAttribute("Pass_" .. pass.Key, true)
			elseif not ok then
				warn("[LaunchParty] Pass check failed:", pass.Key, result)
			end
		end
	end
	local fighter = FighterService.GetByPlayer(player)
	if fighter then
		ShopService.ApplyCosmetics(fighter)
	end
end

function ShopService.Init()
	Net.Event("ShopAction").OnServerEvent:Connect(onAction)
	MarketplaceService.ProcessReceipt = processReceipt

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
		if not purchased then
			return
		end
		for _, pass in Shop.Passes do
			if pass.Id == passId then
				player:SetAttribute("Pass_" .. pass.Key, true)
				tell(player, true, "You got " .. pass.Name .. "! Thanks for the support.")
			end
		end
		local fighter = FighterService.GetByPlayer(player)
		if fighter then
			ShopService.ApplyCosmetics(fighter)
		end
	end)

	DataService.ProfileLoaded:Connect(function(player)
		local fighter = FighterService.GetByPlayer(player)
		if fighter then
			ShopService.ApplyCosmetics(fighter)
		end
	end)

	Players.PlayerAdded:Connect(checkPasses)
	for _, player in Players:GetPlayers() do
		task.spawn(checkPasses, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		lastAction[player] = nil
	end)
end

return ShopService
