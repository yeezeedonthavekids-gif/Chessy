-- Everything you can buy, all in one place.
--
-- HOW TO HOOK UP ROBUX ITEMS
--   1. Publish the game, then go to create.roblox.com > your game > Monetization.
--   2. Make a Pass for each entry in Shop.Passes and a Developer Product for each entry
--      in Shop.Products and Shop.Bundles.
--   3. Paste each ID below where it says Id = 0.
-- Anything still at 0 shows in the shop as "coming soon" and can't be bought.
-- Robux = the price you set on the website. It's only used for the label in the shop.
local Shop = {}

Shop.Currency = "Bonks"

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

-- Skins recolor your whole avatar. Price is in Bonks. Pass / BundleOnly items can't be bought with Bonks.
Shop.Skins = {
	{ Id = "classic", Name = "Classic", Price = 0, Blurb = "Your normal avatar." },
	{ Id = "bubblegum", Name = "Bubblegum", Price = 150, Blurb = "Very pink.", Color = rgb(255, 120, 200), Material = Enum.Material.SmoothPlastic },
	{ Id = "slime", Name = "Slime", Price = 250, Blurb = "Kinda gross. Kinda cool.", Color = rgb(110, 255, 90), Material = Enum.Material.Glass, Transparency = 0.15 },
	{ Id = "deepsea", Name = "Deep Sea", Price = 300, Blurb = "Straight from the bottom of the ocean.", Color = rgb(40, 130, 255), Material = Enum.Material.Glass },
	{ Id = "tincan", Name = "Tin Can", Price = 400, Blurb = "Beep boop.", Color = rgb(175, 180, 195), Material = Enum.Material.DiamondPlate },
	{ Id = "ghost", Name = "Ghost", Price = 600, Blurb = "Spooky, but you can still get punched.", Color = rgb(235, 245, 255), Material = Enum.Material.Neon, Transparency = 0.45 },
	{ Id = "molten", Name = "Molten", Price = 900, Blurb = "You're on fire. Like actually.", Color = rgb(255, 90, 30), Material = Enum.Material.Neon, Effect = "Fire" },
	{ Id = "gold", Name = "Solid Gold", Price = 2000, Blurb = "For showing off.", Color = rgb(255, 200, 40), Material = Enum.Material.Foil, Effect = "Sparkles" },
	{ Id = "galaxy", Name = "Galaxy", BundleOnly = "LegendBundle", Blurb = "Comes with the Legend Bundle.", Color = rgb(120, 60, 230), Material = Enum.Material.Neon, Effect = "Sparkles" },
	{ Id = "vip", Name = "VIP Drip", Pass = "VIP", Blurb = "VIP pass only.", Color = rgb(25, 25, 30), Material = Enum.Material.Foil, Effect = "Sparkles" },
}

-- Trails show up when you move fast (dashes, getting launched).
Shop.Trails = {
	{ Id = "level", Name = "Level Trail", Price = 0, Blurb = "Changes color as you level up." },
	{ Id = "bubble", Name = "Bubble", Price = 120, Blurb = "Soft pink and blue.", Colors = ColorSequence.new(rgb(255, 150, 220), rgb(140, 210, 255)) },
	{ Id = "toxic", Name = "Toxic", Price = 200, Blurb = "Don't touch it.", Colors = ColorSequence.new(rgb(180, 255, 60), rgb(30, 200, 90)) },
	{ Id = "frost", Name = "Frostbite", Price = 350, Blurb = "Brr.", Colors = ColorSequence.new(rgb(255, 255, 255), rgb(90, 200, 255)) },
	{ Id = "sunset", Name = "Sunset", Price = 350, Blurb = "Orange into pink.", Colors = ColorSequence.new(rgb(255, 170, 40), rgb(255, 60, 150)) },
	{ Id = "goldrush", Name = "Gold Rush", BundleOnly = "LegendBundle", Blurb = "Comes with the Legend Bundle.", Colors = ColorSequence.new(rgb(255, 240, 150), rgb(255, 170, 0)) },
	{
		Id = "rainbow",
		Name = "Rainbow",
		Pass = "RainbowTrail",
		Blurb = "Rainbow Trail pass.",
		Colors = ColorSequence.new({
			ColorSequenceKeypoint.new(0, rgb(255, 70, 70)),
			ColorSequenceKeypoint.new(0.25, rgb(255, 220, 60)),
			ColorSequenceKeypoint.new(0.5, rgb(80, 255, 120)),
			ColorSequenceKeypoint.new(0.75, rgb(70, 160, 255)),
			ColorSequenceKeypoint.new(1, rgb(200, 90, 255)),
		}),
	},
}

-- Game passes (one-time Robux purchases).
Shop.Passes = {
	{ Key = "VIP", Name = "VIP", Id = 0, Robux = 199, Blurb = "Double Bonks from every match, a gold name, and the VIP Drip skin." },
	{ Key = "DoubleXP", Name = "2x XP", Id = 0, Robux = 149, Blurb = "Level up twice as fast and unlock perks sooner." },
	{ Key = "Reroll", Name = "Card Shark", Id = 0, Robux = 99, Blurb = "Don't like your perk cards? Reroll them once every draft." },
	{ Key = "RainbowTrail", Name = "Rainbow Trail", Id = 0, Robux = 79, Blurb = "Leave a rainbow behind you whenever you dash or go flying." },
}

-- Developer products (can be bought again and again).
Shop.Products = {
	{ Key = "Bonks100", Name = "Handful of Bonks", Id = 0, Robux = 25, Bonks = 100 },
	{ Key = "Bonks550", Name = "Bag of Bonks", Id = 0, Robux = 99, Bonks = 550 },
	{ Key = "Bonks1200", Name = "Big Bag of Bonks", Id = 0, Robux = 199, Bonks = 1200 },
	{ Key = "Bonks3000", Name = "Bonk Vault", Id = 0, Robux = 449, Bonks = 3000 },
}

-- Bundles are developer products too, but each one can only be bought once.
Shop.Bundles = {
	{
		Key = "StarterBundle",
		Name = "Starter Bundle",
		Id = 0,
		Robux = 49,
		Bonks = 300,
		Skins = { "molten" },
		Trails = { "sunset" },
		OneTime = true,
		Blurb = "300 Bonks, the Molten skin and the Sunset trail. Good deal for new players.",
	},
	{
		Key = "LegendBundle",
		Name = "Legend Bundle",
		Id = 0,
		Robux = 399,
		Bonks = 1500,
		Skins = { "gold", "galaxy" },
		Trails = { "goldrush" },
		OneTime = true,
		Blurb = "1500 Bonks, Solid Gold and Galaxy skins, plus the Gold Rush trail. Galaxy and Gold Rush only come in this bundle.",
	},
}

function Shop.Find(list: { any }, id: string): any?
	for _, item in list do
		if item.Id == id or item.Key == id then
			return item
		end
	end
	return nil
end

-- Finds the product or bundle with this developer product ID.
function Shop.FindProductById(productId: number): any?
	if productId == 0 then
		return nil
	end
	for _, list in { Shop.Products, Shop.Bundles } do
		for _, item in list do
			if item.Id == productId then
				return item
			end
		end
	end
	return nil
end

return Shop
