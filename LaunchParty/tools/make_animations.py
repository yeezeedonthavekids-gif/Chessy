#!/usr/bin/env python3
"""Generates the punch animations as Roblox KeyframeSequence files (.rbxmx).

These are real animations: the same data the Animation Editor produces. Each keyframe stores a
pose per R15 joint (rotation in degrees + optional offset in studs). Edit the poses below and
re-run this script to tweak them, or open them in Studio's Animation Editor.

Usage: python3 tools/make_animations.py   (writes src/animations/*.rbxmx)
"""
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "src", "animations")

# R15 joint tree: Pose objects must nest the same way the rig's parts do.
TREE = {
    "HumanoidRootPart": ["LowerTorso"],
    "LowerTorso": ["UpperTorso", "LeftUpperLeg", "RightUpperLeg"],
    "UpperTorso": ["Head", "LeftUpperArm", "RightUpperArm"],
    "LeftUpperArm": ["LeftLowerArm"],
    "LeftLowerArm": ["LeftHand"],
    "RightUpperArm": ["RightLowerArm"],
    "RightLowerArm": ["RightHand"],
    "LeftUpperLeg": ["LeftLowerLeg"],
    "LeftLowerLeg": ["LeftFoot"],
    "RightUpperLeg": ["RightLowerLeg"],
    "RightLowerLeg": ["RightFoot"],
}

# Angles: (pitch, yaw, roll) in degrees.
#   pitch +  = limb swings forward / torso leans back      pitch - = lean forward / limb back
#   yaw   +  = twist left (brings the right shoulder forward)
#   roll  +  = right arm out to the side (mirror for left)
# Optional 4th value: offset (x, y, z) in studs; -z is forward.

GUARD = {
    "LowerTorso": (0, 0, 0, (0, -0.15, 0)),
    "UpperTorso": (-6, -8, 0),
    "Head": (6, 8, 0),
    "RightUpperArm": (35, 0, 8),
    "RightLowerArm": (110, 0, 0),
    "RightHand": (0, 0, 0),
    "LeftUpperArm": (45, 0, -8),
    "LeftLowerArm": (105, 0, 0),
    "LeftHand": (0, 0, 0),
    "LeftUpperLeg": (14, 0, 0),
    "LeftLowerLeg": (-14, 0, 0),
    "RightUpperLeg": (-10, 0, 0),
    "RightLowerLeg": (-8, 0, 0),
}

JAB_HIT = {
    "LowerTorso": (0, 12, 0, (0, -0.2, -0.35)),
    "UpperTorso": (-10, 26, 0),
    "Head": (6, -18, 0),
    "RightUpperArm": (92, 8, 0),
    "RightLowerArm": (4, 0, 0),
    "RightHand": (-10, 0, 0),
    "LeftUpperArm": (40, 0, -10),
    "LeftLowerArm": (110, 0, 0),
    "LeftHand": (0, 0, 0),
    "LeftUpperLeg": (24, 0, 0),
    "LeftLowerLeg": (-20, 0, 0),
    "RightUpperLeg": (-22, 0, 0),
    "RightLowerLeg": (-6, 0, 0),
}

WOUND = {
    "LowerTorso": (0, -18, 0, (0, -0.3, 0.2)),
    "UpperTorso": (-8, -36, 0),
    "Head": (8, 34, 0),
    "RightUpperArm": (-30, 0, 25),
    "RightLowerArm": (125, 0, 0),
    "RightHand": (10, 0, 0),
    "LeftUpperArm": (70, -15, 0),
    "LeftLowerArm": (30, 0, 0),
    "LeftHand": (0, 0, 0),
    "LeftUpperLeg": (28, 0, 0),
    "LeftLowerLeg": (-32, 0, 0),
    "RightUpperLeg": (-24, 0, 0),
    "RightLowerLeg": (-22, 0, 0),
}

WOUND_DEEP = dict(WOUND)
WOUND_DEEP.update({
    "LowerTorso": (0, -22, 0, (0, -0.4, 0.3)),
    "UpperTorso": (-10, -42, 0),
    "RightUpperArm": (-38, 0, 28),
    "RightLowerArm": (130, 0, 0),
})

HAYMAKER_HIT = {
    "LowerTorso": (0, 22, 0, (0, -0.4, -0.9)),
    "UpperTorso": (-20, 44, 0),
    "Head": (10, -32, 0),
    "RightUpperArm": (100, 16, 0),
    "RightLowerArm": (0, 0, 0),
    "RightHand": (-15, 0, 0),
    "LeftUpperArm": (-35, 0, -20),
    "LeftLowerArm": (55, 0, 0),
    "LeftHand": (0, 0, 0),
    "LeftUpperLeg": (38, 0, 0),
    "LeftLowerLeg": (-38, 0, 0),
    "RightUpperLeg": (-34, 0, 0),
    "RightLowerLeg": (-12, 0, 0),
}

HAYMAKER_FOLLOW = dict(HAYMAKER_HIT)
HAYMAKER_FOLLOW.update({
    "UpperTorso": (-22, 52, 0),
    "RightUpperArm": (95, 30, 0),
    "LowerTorso": (0, 26, 0, (0, -0.4, -1.0)),
})

NEUTRAL = {name: (0, 0, 0) for name in GUARD}

# name -> (loop, [(time, pose), ...])
ANIMATIONS = {
    "JabRight": (False, [(0.0, GUARD), (0.06, JAB_HIT), (0.13, JAB_HIT), (0.26, GUARD), (0.34, NEUTRAL)]),
    "WindUp": (True, [(0.0, WOUND), (0.45, WOUND_DEEP), (0.9, WOUND)]),
    "Haymaker": (False, [
        (0.0, WOUND),
        (0.08, HAYMAKER_HIT),
        (0.22, HAYMAKER_FOLLOW),
        (0.45, GUARD),
        (0.6, NEUTRAL),
    ]),
}


def mirror_pose(pose):
    result = {}
    for name, value in pose.items():
        target = name.replace("Right", "\0").replace("Left", "Right").replace("\0", "Left")
        pitch, yaw, roll = value[0], value[1], value[2]
        mirrored = (pitch, -yaw, -roll)
        if len(value) > 3:
            x, y, z = value[3]
            mirrored = mirrored + ((-x, y, z),)
        result[target] = mirrored
    return result


ANIMATIONS["JabLeft"] = (False, [(t, mirror_pose(p)) for t, p in ANIMATIONS["JabRight"][1]])


def rotation_yxz(pitch, yaw, roll):
    """Matches CFrame.fromEulerAnglesYXZ(pitch, yaw, roll) = Ry * Rx * Rz."""
    x, y, z = (math.radians(a) for a in (pitch, yaw, roll))
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]

    def mul(a, b):
        return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

    return mul(mul(ry, rx), rz)


class Writer:
    def __init__(self):
        self.ref = 0
        self.lines = []

    def next_ref(self):
        self.ref += 1
        return f"RBXANIM{self.ref:06d}"

    def pose(self, name, pose, depth):
        keyed = pose.get(name)
        children = [child for child in TREE.get(name, []) if self.has_keyed(child, pose)]
        if keyed is None and not children:
            return
        pitch, yaw, roll = (keyed[0], keyed[1], keyed[2]) if keyed else (0, 0, 0)
        offset = keyed[3] if keyed and len(keyed) > 3 else (0, 0, 0)
        m = rotation_yxz(pitch, yaw, roll)
        pad = "\t" * depth
        self.lines.append(f'{pad}<Item class="Pose" referent="{self.next_ref()}">')
        self.lines.append(f"{pad}\t<Properties>")
        self.lines.append(f'{pad}\t\t<string name="Name">{name}</string>')
        cf = "".join(
            [f"<X>{offset[0]:.4f}</X><Y>{offset[1]:.4f}</Y><Z>{offset[2]:.4f}</Z>"]
            + [f"<R{i}{j}>{m[i][j]:.6f}</R{i}{j}>" for i in range(3) for j in range(3)]
        )
        self.lines.append(f'{pad}\t\t<CoordinateFrame name="CFrame">{cf}</CoordinateFrame>')
        self.lines.append(f'{pad}\t\t<float name="Weight">{1 if keyed else 0}</float>')
        self.lines.append(f'{pad}\t\t<token name="EasingStyle">0</token>')
        self.lines.append(f'{pad}\t\t<token name="EasingDirection">0</token>')
        self.lines.append(f"{pad}\t</Properties>")
        for child in children:
            self.pose(child, pose, depth + 1)
        self.lines.append(f"{pad}</Item>")

    def has_keyed(self, name, pose):
        return name in pose or any(self.has_keyed(child, pose) for child in TREE.get(name, []))


def write_animation(name, loop, frames):
    writer = Writer()
    w = writer.lines
    w.append('<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
             'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="4">')
    w.append(f'\t<Item class="KeyframeSequence" referent="{writer.next_ref()}">')
    w.append("\t\t<Properties>")
    w.append(f'\t\t\t<string name="Name">{name}</string>')
    w.append(f'\t\t\t<bool name="Loop">{"true" if loop else "false"}</bool>')
    w.append('\t\t\t<token name="Priority">2</token>')  # Action
    w.append("\t\t</Properties>")
    for time, pose in frames:
        w.append(f'\t\t<Item class="Keyframe" referent="{writer.next_ref()}">')
        w.append("\t\t\t<Properties>")
        w.append('\t\t\t\t<string name="Name">Keyframe</string>')
        w.append(f'\t\t\t\t<float name="Time">{time}</float>')
        w.append("\t\t\t</Properties>")
        writer.pose("HumanoidRootPart", pose, 3)
        w.append("\t\t</Item>")
    w.append("\t</Item>")
    w.append("</roblox>")
    path = os.path.join(OUT, name + ".rbxmx")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(w) + "\n")
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (loop, frames) in ANIMATIONS.items():
        print("wrote", os.path.relpath(write_animation(name, loop, frames), ROOT))


if __name__ == "__main__":
    main()
