-- Small helpers for building GUIs in code.
local TweenService = game:GetService("TweenService")

local UI = {}

UI.Font = Enum.Font.FredokaOne
UI.BodyFont = Enum.Font.GothamBold
UI.Panel = Color3.fromRGB(22, 24, 38)

function UI.new(className: string, props: { [string]: any }?, children: { Instance }?): any
	local instance = Instance.new(className)
	local parent = nil
	if props then
		for key, value in props do
			if key == "Parent" then
				parent = value
			else
				(instance :: any)[key] = value
			end
		end
	end
	if children then
		for _, child in children do
			child.Parent = instance
		end
	end
	if parent then
		instance.Parent = parent
	end
	return instance
end

function UI.corner(radius: number?): UICorner
	return UI.new("UICorner", { CornerRadius = UDim.new(0, radius or 10) })
end

function UI.stroke(color: Color3?, thickness: number?, transparency: number?): UIStroke
	return UI.new("UIStroke", {
		Color = color or Color3.new(0, 0, 0),
		Thickness = thickness or 2,
		Transparency = transparency or 0,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

function UI.gradient(top: Color3, bottom: Color3, rotation: number?): UIGradient
	return UI.new("UIGradient", {
		Color = ColorSequence.new(top, bottom),
		Rotation = rotation or 90,
	})
end

-- Chunky rounded button with a gradient background.
-- (The gradient lives on a child frame so it doesn't tint the text.) Returns button, label.
function UI.button(text: string, top: Color3, bottom: Color3, props: { [string]: any }): (TextButton, TextLabel)
	local defaults = {
		Text = "",
		BackgroundTransparency = 1,
		AutoButtonColor = false,
	}
	for key, value in props do
		defaults[key] = value
	end
	local button = UI.new("TextButton", defaults)
	UI.new("Frame", {
		Name = "Background",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(1, 1, 1),
		ZIndex = button.ZIndex,
		Parent = button,
	}, {
		UI.corner(12),
		UI.gradient(top, bottom),
		UI.new("UIStroke", { Color = Color3.new(0, 0, 0), Thickness = 2, Transparency = 0.4, ApplyStrokeMode = Enum.ApplyStrokeMode.Border }),
	})
	local label = UI.label({
		Name = "Label",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(1, -12, 1, -8),
		Text = text,
		ZIndex = button.ZIndex + 1,
		Parent = button,
	})
	UI.textStroke(1.5).Parent = label
	button.MouseEnter:Connect(function()
		UI.pop(button, 1.08, 0.15)
	end)
	return button, label
end

function UI.textStroke(thickness: number?): UIStroke
	return UI.new("UIStroke", {
		Color = Color3.new(0, 0, 0),
		Thickness = thickness or 2,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual,
	})
end

function UI.label(props: { [string]: any }): TextLabel
	local defaults = {
		BackgroundTransparency = 1,
		Font = UI.Font,
		TextColor3 = Color3.new(1, 1, 1),
		TextScaled = true,
	}
	for key, value in props do
		defaults[key] = value
	end
	return UI.new("TextLabel", defaults)
end

-- Quick "pop" scale animation using a UIScale child.
function UI.pop(guiObject: GuiObject, from: number?, duration: number?)
	local scale = guiObject:FindFirstChildOfClass("UIScale")
	if not scale then
		scale = UI.new("UIScale", { Parent = guiObject })
	end
	scale.Scale = from or 1.35
	TweenService:Create(scale, TweenInfo.new(duration or 0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
		Scale = 1,
	}):Play()
end

function UI.tween(instance: Instance, duration: number, goals: { [string]: any }, style: Enum.EasingStyle?, direction: Enum.EasingDirection?): Tween
	local tween = TweenService:Create(
		instance,
		TweenInfo.new(duration, style or Enum.EasingStyle.Quad, direction or Enum.EasingDirection.Out),
		goals
	)
	tween:Play()
	return tween
end

function UI.formatTime(seconds: number): string
	seconds = math.max(0, math.ceil(seconds))
	return string.format("%d:%02d", seconds // 60, seconds % 60)
end

return UI
