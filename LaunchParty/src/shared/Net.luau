-- Single source of truth for remotes. The server creates them; clients wait for them.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Net = {}

local REMOTE_NAMES = {
	-- client -> server
	"ChargeStart",
	"Punch",
	"Dash",
	"DraftPick",
	"DraftReroll",
	"ShopAction",
	"TutorialDone",
	-- server -> client
	"Knockback",
	"Effect",
	"Announce",
	"KillFeed",
	"DraftOffer",
	"DraftClose",
	"MatchResults",
	"ShopResult",
}

local IS_SERVER = RunService:IsServer()
local remoteFolder: Folder? = nil

local function getFolder(): Folder
	if remoteFolder then
		return remoteFolder
	end
	if IS_SERVER then
		local folder = ReplicatedStorage:FindFirstChild("Remotes")
		if not folder then
			folder = Instance.new("Folder")
			folder.Name = "Remotes"
			folder.Parent = ReplicatedStorage
		end
		for _, name in REMOTE_NAMES do
			if not folder:FindFirstChild(name) then
				local remote = Instance.new("RemoteEvent")
				remote.Name = name
				remote.Parent = folder
			end
		end
		remoteFolder = folder
	else
		remoteFolder = ReplicatedStorage:WaitForChild("Remotes") :: Folder
	end
	return remoteFolder :: Folder
end

function Net.Event(name: string): RemoteEvent
	assert(table.find(REMOTE_NAMES, name), "Unknown remote: " .. tostring(name))
	local folder = getFolder()
	if IS_SERVER then
		return folder:FindFirstChild(name) :: RemoteEvent
	end
	return folder:WaitForChild(name) :: RemoteEvent
end

-- Replicated folder whose attributes describe the current match state (late-join safe).
function Net.GameState(): Folder
	if IS_SERVER then
		local state = ReplicatedStorage:FindFirstChild("GameState")
		if not state then
			state = Instance.new("Folder")
			state.Name = "GameState"
			state.Parent = ReplicatedStorage
		end
		return state :: Folder
	end
	return ReplicatedStorage:WaitForChild("GameState") :: Folder
end

return Net
