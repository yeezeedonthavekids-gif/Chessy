#!/usr/bin/env python3
"""Builds LaunchParty.rbxlx from default.project.json using Rojo's file conventions.

Rojo users can run `rojo build -o LaunchParty.rbxlx` instead; this script exists so the
place can be built without installing anything.

Usage: python3 tools/build_rbxlx.py [output_path]
"""
import json
import os
import sys
from xml.sax.saxutils import escape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
EXTENSIONS = (".luau", ".lua")


class Builder:
    def __init__(self):
        self.next_ref = 0
        self.lines = []

    def ref(self):
        self.next_ref += 1
        return f"RBX{self.next_ref:08X}"

    def open_item(self, class_name, name, depth, properties=None, source=None):
        pad = "\t" * depth
        self.lines.append(f'{pad}<Item class="{class_name}" referent="{self.ref()}">')
        self.lines.append(f"{pad}\t<Properties>")
        self.lines.append(f'{pad}\t\t<string name="Name">{escape(name)}</string>')
        for key, value in (properties or {}).items():
            if isinstance(value, bool):
                self.lines.append(f'{pad}\t\t<bool name="{key}">{"true" if value else "false"}</bool>')
            elif isinstance(value, (int, float)):
                self.lines.append(f'{pad}\t\t<float name="{key}">{value}</float>')
            elif isinstance(value, str):
                self.lines.append(f'{pad}\t\t<string name="{key}">{escape(value)}</string>')
            else:
                raise ValueError(f"Unsupported property {key}={value!r}")
        if source is not None:
            safe = source.replace("]]>", "]]]]><![CDATA[>")
            self.lines.append(f'{pad}\t\t<ProtectedString name="Source"><![CDATA[{safe}]]></ProtectedString>')
        self.lines.append(f"{pad}\t</Properties>")

    def embed_model(self, path, depth):
        """Inlines the instances from an .rbxmx model file (e.g. animation KeyframeSequences)."""
        text = read(path)
        start, end = text.index("<Item"), text.rindex("</Item>") + len("</Item>")
        body = text[start:end]
        prefix = f"RBXM{self.next_ref:04X}_"
        self.next_ref += 1
        body = body.replace('referent="', f'referent="{prefix}')
        pad = "\t" * depth
        self.lines.extend(pad + line for line in body.splitlines())

    def close_item(self, depth):
        self.lines.append("\t" * depth + "</Item>")


def script_kind(filename):
    """Returns (class_name, instance_name) for a script file, or None if not a script."""
    for ext in EXTENSIONS:
        if filename.endswith(".server" + ext):
            return "Script", filename[: -len(".server" + ext)]
        if filename.endswith(".client" + ext):
            return "LocalScript", filename[: -len(".client" + ext)]
        if filename.endswith(ext):
            return "ModuleScript", filename[: -len(ext)]
    return None


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def emit_path(builder, path, name, depth, properties=None):
    if os.path.isfile(path):
        kind = script_kind(os.path.basename(path))
        if not kind:
            raise ValueError(f"Unsupported file: {path}")
        builder.open_item(kind[0], name, depth, properties, read(path))
        builder.close_item(depth)
        return

    init = None
    for candidate, class_name in (("init.server", "Script"), ("init.client", "LocalScript"), ("init", "ModuleScript")):
        for ext in EXTENSIONS:
            init_path = os.path.join(path, candidate + ext)
            if os.path.exists(init_path):
                init = (class_name, init_path)
                break
        if init:
            break

    if init:
        builder.open_item(init[0], name, depth, properties, read(init[1]))
    else:
        builder.open_item("Folder", name, depth, properties)

    for entry in sorted(os.listdir(path)):
        full = os.path.join(path, entry)
        if init and os.path.abspath(full) == os.path.abspath(init[1]):
            continue
        if os.path.isdir(full):
            emit_path(builder, full, entry, depth + 1)
        elif entry.endswith(".rbxmx"):
            builder.embed_model(full, depth + 1)
        else:
            kind = script_kind(entry)
            if kind:
                emit_path(builder, full, kind[1], depth + 1)
    builder.close_item(depth)


def emit_node(builder, name, node, depth):
    properties = node.get("$properties")
    if "$path" in node:
        emit_path(builder, os.path.join(ROOT, node["$path"]), name, depth, properties)
        return
    builder.open_item(node.get("$className", "Folder"), name, depth, properties)
    for child_name, child in node.items():
        if not child_name.startswith("$"):
            emit_node(builder, child_name, child, depth + 1)
    builder.close_item(depth)


def main():
    output = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "LaunchParty.rbxlx")
    project = json.loads(read(os.path.join(ROOT, "default.project.json")))
    builder = Builder()
    builder.lines.append(
        '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">'
    )
    for name, node in project["tree"].items():
        if not name.startswith("$"):
            emit_node(builder, name, node, 1)
    builder.lines.append("</roblox>")
    with open(output, "w", encoding="utf-8") as handle:
        handle.write("\n".join(builder.lines) + "\n")
    print(f"Wrote {output} ({builder.next_ref} instances)")


if __name__ == "__main__":
    main()
