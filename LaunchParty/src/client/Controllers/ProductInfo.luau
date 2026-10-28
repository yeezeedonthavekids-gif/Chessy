-- Fetches the real price and icon of passes / developer products from Roblox (cached).
-- So the shop always shows exactly what you set on the website, including the image you uploaded.
local MarketplaceService = game:GetService("MarketplaceService")

local ProductInfo = {}

export type Info = { Price: number?, Icon: string? }

local cache: { [string]: Info } = {}
local pending: { [string]: { (Info) -> () } } = {}

-- kind: "Pass" | "Product". Calls `callback(info)` once loaded (immediately if cached).
function ProductInfo.Get(kind: string, id: number, callback: (Info) -> ())
	if id == 0 then
		return
	end
	local key = kind .. id
	if cache[key] then
		callback(cache[key])
		return
	end
	if pending[key] then
		table.insert(pending[key], callback)
		return
	end
	pending[key] = { callback }
	task.spawn(function()
		local infoType = if kind == "Pass" then Enum.InfoType.GamePass else Enum.InfoType.Product
		local info: Info = {}
		for attempt = 1, 3 do
			local ok, result = pcall(function()
				return MarketplaceService:GetProductInfo(id, infoType)
			end)
			if ok and type(result) == "table" then
				info.Price = result.PriceInRobux
				local iconId = result.IconImageAssetId
				if type(iconId) == "number" and iconId > 0 then
					info.Icon = "rbxassetid://" .. iconId
				end
				break
			end
			task.wait(attempt)
		end
		cache[key] = info
		local callbacks = pending[key]
		pending[key] = nil
		for _, fn in callbacks do
			task.spawn(fn, info)
		end
	end)
end

function ProductInfo.FormatTime(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return string.format("%d:%02d:%02d", seconds // 3600, (seconds % 3600) // 60, seconds % 60)
end

return ProductInfo
