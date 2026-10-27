#!/usr/bin/env python3
"""Static sanity checker for the LaunchParty Luau sources.

Not a full Luau parser, but it catches the mistakes that break a Roblox place
before you ever press Play:
  * unbalanced blocks (function/if/do/repeat vs end/until), aware of Luau if-expressions
  * unbalanced brackets
  * locals used before they are declared (nil upvalue bugs)
  * unknown globals (typos)
  * require() targets that don't exist
  * Net.Event names that aren't registered
  * Config.<Section>.<Key> references that don't exist

Usage: python3 tools/check_luau.py [project_root]
"""
import os
import re
import sys

KEYWORDS = {
    "and", "break", "continue", "do", "else", "elseif", "end", "false", "for", "function",
    "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until",
    "while", "export", "type", "typeof",
}

GLOBALS = {
    # Lua / Luau builtins
    "print", "warn", "error", "assert", "pcall", "xpcall", "require", "select", "type", "typeof",
    "tostring", "tonumber", "pairs", "ipairs", "next", "setmetatable", "getmetatable", "rawget",
    "rawset", "rawequal", "unpack", "math", "string", "table", "os", "coroutine", "task", "utf8",
    "bit32", "buffer", "debug", "_G", "self",
    # Roblox globals & datatypes
    "game", "workspace", "script", "Enum", "Instance", "Vector3", "Vector2", "CFrame", "Color3",
    "UDim", "UDim2", "Random", "RaycastParams", "TweenInfo", "NumberSequence", "ColorSequence",
    "ColorSequenceKeypoint", "NumberSequenceKeypoint", "PhysicalProperties", "Ray", "Region3",
    "BrickColor", "Rect", "NumberRange", "tick", "time", "wait", "delay", "spawn",
}

# Names that legitimately appear only in type annotations.
TYPE_NAMES = {
    "number", "string", "boolean", "any", "never", "unknown", "nil",
    "Instance", "Model", "Part", "BasePart", "Humanoid", "Player", "Folder", "RemoteEvent",
    "BillboardGui", "Trail", "Highlight", "RBXScriptConnection", "Attachment", "Animator",
    "AnimationTrack", "TextLabel", "TextButton", "Frame", "GuiObject", "UICorner", "UIStroke",
    "Tween", "ScreenGui", "IntValue", "DataStore", "Vector3", "CFrame", "Color3", "ColorSequence",
    "RNG", "Stats", "PerkDef", "PerkLike", "Tuning", "Fighter", "Tile", "HitSpec", "Pending",
    "Profile", "EventDef", "DashTuning", "MatchResult", "MatchInput", "Enum", "T",
}

TOKEN_RE = re.compile(
    r"""
    (?P<ws>\s+)
  | (?P<longcomment>--\[(?P<eq1>=*)\[.*?\](?P=eq1)\])
  | (?P<comment>--[^\n]*)
  | (?P<longstring>\[(?P<eq2>=*)\[.*?\](?P=eq2)\])
  | (?P<string>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)
  | (?P<number>0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)
  | (?P<name>[A-Za-z_][A-Za-z0-9_]*)
  | (?P<op>\.\.\.|\.\.=|//=|\.\.|==|~=|<=|>=|\+=|-=|\*=|/=|%=|\^=|//|->|::|[-+*/%^#<>=(){}\[\];:,.?&|])
    """,
    re.VERBOSE | re.DOTALL,
)

EXPR_PRECEDERS = {
    "=", "(", ",", "{", "[", "return", "and", "or", "not", "..", "+", "-", "*", "/", "%", "^",
    "==", "~=", "<", ">", "<=", ">=", "+=", "-=", "*=", "/=", "//", "//=", "..=", "%=", "^=",
    "then", "else", "in",
}


class Tok:
    __slots__ = ("kind", "value", "line")

    def __init__(self, kind, value, line):
        self.kind, self.value, self.line = kind, value, line

    def __repr__(self):
        return f"{self.kind}:{self.value}@{self.line}"


def tokenize(source, path, problems):
    tokens = []
    pos, line = 0, 1
    while pos < len(source):
        match = TOKEN_RE.match(source, pos)
        if not match:
            problems.append(f"{path}:{line}: unexpected character {source[pos]!r}")
            pos += 1
            continue
        kind = match.lastgroup
        text = match.group(0)
        if kind in ("eq1", "eq2"):
            kind = "longcomment" if text.startswith("--") else "longstring"
        if kind not in ("ws", "comment", "longcomment"):
            if kind == "longstring":
                kind = "string"
            tokens.append(Tok(kind, text, line))
        line += text.count("\n")
        pos = match.end()
    return tokens


def check_blocks(tokens, path, problems):
    stack = []  # (opener, line)
    brackets = []
    pairs = {")": "(", "]": "[", "}": "{"}
    prev = None
    in_if_expr = 0  # nesting count of if-expressions awaiting their 'else'
    for i, tok in enumerate(tokens):
        v = tok.value
        if tok.kind == "op":
            if v in "([{":
                brackets.append((v, tok.line))
            elif v in ")]}":
                if not brackets or brackets[-1][0] != pairs[v]:
                    problems.append(f"{path}:{tok.line}: unbalanced '{v}'")
                else:
                    brackets.pop()
        elif tok.kind == "name":
            if v == "function":
                stack.append(("function", tok.line))
            elif v == "if":
                is_expr = prev is not None and prev.value in EXPR_PRECEDERS and not (
                    prev.value in ("then", "else") and prev.kind == "name" and not _inside_if_expr(stack)
                )
                # 'then'/'else' only precede an if-expression when we're inside another if-expression.
                if prev is not None and prev.value in ("then", "else"):
                    is_expr = _inside_if_expr(stack)
                if is_expr:
                    stack.append(("ifexpr", tok.line))
                else:
                    stack.append(("if", tok.line))
            elif v == "else" and stack and stack[-1][0] == "ifexpr":
                # the final 'else' branch of an if-expression is a single expression; close it lazily
                stack[-1] = ("ifexpr-else", stack[-1][1])
            elif v == "do":
                stack.append(("do", tok.line))
            elif v == "repeat":
                stack.append(("repeat", tok.line))
            elif v == "end":
                _close_if_exprs(stack)
                if not stack:
                    problems.append(f"{path}:{tok.line}: 'end' without an open block")
                else:
                    opener, line = stack.pop()
                    if opener == "repeat":
                        problems.append(f"{path}:{tok.line}: 'end' closes 'repeat' from line {line}")
            elif v == "until":
                _close_if_exprs(stack)
                if not stack or stack[-1][0] != "repeat":
                    problems.append(f"{path}:{tok.line}: 'until' without 'repeat'")
                else:
                    stack.pop()
            elif v in ("local", "return", "break", "continue") or (
                v in ("elseif",) and stack and stack[-1][0] == "if"
            ):
                _close_if_exprs(stack)
        prev = tok
    _close_if_exprs(stack)
    for opener, line in stack:
        problems.append(f"{path}:{line}: '{opener}' is never closed")
    for bracket, line in brackets:
        problems.append(f"{path}:{line}: '{bracket}' is never closed")


def _inside_if_expr(stack):
    return bool(stack) and stack[-1][0] in ("ifexpr", "ifexpr-else")


def _close_if_exprs(stack):
    while stack and stack[-1][0] == "ifexpr-else":
        stack.pop()


STATEMENT_ENDERS = {"end", "then", "do", "else", "repeat", "(", "{", ",", "=", "return", "in", "and", "or", "not"}


def check_ambiguous_calls(tokens, path, problems):
    """Luau rejects a statement starting with '(' right after an expression on the previous line."""
    param_closers = set()
    for i, tok in enumerate(tokens):
        if tok.value == "function":
            j, depth = i + 1, 0
            while j < len(tokens):
                if tokens[j].value == "(":
                    depth += 1
                elif tokens[j].value == ")":
                    depth -= 1
                    if depth == 0:
                        param_closers.add(j)
                        break
                j += 1
    for i in range(1, len(tokens)):
        tok, prev = tokens[i], tokens[i - 1]
        if (i - 1) in param_closers:
            continue
        if tok.value == "(" and tok.line > prev.line and prev.value not in STATEMENT_ENDERS:
            if prev.kind in ("name", "number", "string") or prev.value in (")", "]", "}"):
                if prev.value != "function" and not (prev.kind == "name" and prev.value in KEYWORDS - {"true", "false", "nil"}):
                    problems.append(f"{path}:{tok.line}: ambiguous syntax - line starts with '(' after an expression")


def collect_declarations(tokens):
    """Returns {name: first_declaration_line} for locals, params, loop vars."""
    declared = {}

    def declare(name, line):
        declared.setdefault(name, line)

    for i, tok in enumerate(tokens):
        if tok.kind != "name":
            continue
        if tok.value == "local":
            j = i + 1
            if j < len(tokens) and tokens[j].value == "function":
                if j + 1 < len(tokens):
                    declare(tokens[j + 1].value, tokens[j + 1].line)
                continue
            while j < len(tokens) and tokens[j].kind == "name":
                declare(tokens[j].value, tokens[j].line)
                j += 1
                # skip type annotation
                if j < len(tokens) and tokens[j].value == ":":
                    depth = 0
                    j += 1
                    while j < len(tokens):
                        t = tokens[j].value
                        if t in ("(", "{", "["):
                            depth += 1
                        elif t in (")", "}", "]"):
                            depth -= 1
                        elif depth == 0 and t in (",", "="):
                            break
                        elif depth == 0 and tokens[j].kind == "name" and tokens[j - 1].value not in (":", ".", "->", "?", "|", "&", "<") and t not in TYPE_NAMES:
                            break
                        j += 1
                if j < len(tokens) and tokens[j].value == ",":
                    j += 1
                    continue
                break
        elif tok.value == "function":
            j = i + 1
            while j < len(tokens) and tokens[j].value != "(":
                j += 1
            j += 1
            depth = 0
            while j < len(tokens) and not (depth == 0 and tokens[j].value == ")"):
                t = tokens[j].value
                if t in ("(", "{", "["):
                    depth += 1
                elif t in (")", "}", "]"):
                    depth -= 1
                elif depth == 0 and tokens[j].kind == "name" and tokens[j - 1].value in ("(", ","):
                    declare(t, tokens[j].line)
                j += 1
        elif tok.value == "for":
            j = i + 1
            while j < len(tokens) and tokens[j].value not in ("in", "="):
                if tokens[j].kind == "name":
                    declare(tokens[j].value, tokens[j].line)
                j += 1
        elif tok.value == "type" and i + 1 < len(tokens) and tokens[i + 1].kind == "name":
            nxt = tokens[i + 1]
            if i + 2 < len(tokens) and tokens[i + 2].value in ("=", "<"):
                declare(nxt.value, nxt.line)
    return declared


def check_names(tokens, path, problems, notes):
    declared = collect_declarations(tokens)
    unknown = {}
    brace_stack = []
    for i, tok in enumerate(tokens):
        if tok.kind == "op":
            if tok.value in "([{":
                brace_stack.append(tok.value)
            elif tok.value in ")]}" and brace_stack:
                brace_stack.pop()
            continue
        if tok.kind != "name" or tok.value in KEYWORDS:
            continue
        prev = tokens[i - 1] if i > 0 else None
        nxt = tokens[i + 1] if i + 1 < len(tokens) else None
        if prev is not None and prev.value in (".", ":", "::", "->", "?", "|", "&"):
            continue
        if nxt is not None and nxt.value in ("=", ":") and brace_stack and brace_stack[-1] == "{":
            continue  # table constructor key / table type field
        if prev is not None and prev.value in ("type",) :
            continue
        name = tok.value
        if name in declared:
            if tok.line < declared[name] and name not in GLOBALS:
                problems.append(f"{path}:{tok.line}: '{name}' used before its declaration on line {declared[name]}")
            continue
        if name in GLOBALS or name in TYPE_NAMES:
            continue
        unknown.setdefault(name, tok.line)
    for name, line in unknown.items():
        notes.append(f"{path}:{line}: unknown global '{name}'")


def parse_config(root):
    path = os.path.join(root, "src", "shared", "Config.luau")
    sections = {}
    current = None
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            match = re.match(r"^Config\.(\w+)\s*=\s*\{", raw)
            if match:
                current = match.group(1)
                sections[current] = set()
                continue
            if current and raw.startswith("}"):
                current = None
                continue
            key = re.match(r"^\t(\w+)\s*=", raw)
            if current and key:
                sections[current].add(key.group(1))
    return sections


def parse_remotes(root):
    with open(os.path.join(root, "src", "shared", "Net.luau"), encoding="utf-8") as handle:
        text = handle.read()
    block = re.search(r"REMOTE_NAMES\s*=\s*\{(.*?)\n\}", text, re.DOTALL).group(1)
    return set(re.findall(r'"(\w+)"', block))


def check_references(path, source, root, config, remotes, problems):
    folder = os.path.dirname(path)
    for name in re.findall(r"require\(script\.Parent\.(\w+)\)", source):
        if not os.path.exists(os.path.join(folder, name + ".luau")):
            problems.append(f"{path}: require(script.Parent.{name}) has no matching module")
    for name in re.findall(r"require\(Services\.(\w+)\)", source):
        if not os.path.exists(os.path.join(root, "src", "server", "Services", name + ".luau")):
            problems.append(f"{path}: require(Services.{name}) has no matching module")
    for name in re.findall(r"require\((?:ReplicatedStorage\.)?Shared(?:\.(\w+)|:WaitForChild\(\"(\w+)\"\))\)", source):
        module = name[0] or name[1]
        if not os.path.exists(os.path.join(root, "src", "shared", module + ".luau")):
            problems.append(f"{path}: Shared module '{module}' does not exist")
    for name in re.findall(r'Net\.Event\("(\w+)"\)', source):
        if name not in remotes:
            problems.append(f"{path}: remote '{name}' is not registered in Net.REMOTE_NAMES")

    aliases = {alias: section for alias, section in re.findall(r"local (\w+) = Config\.(\w+)\s*$", source, re.MULTILINE)}
    for section, key in re.findall(r"\bConfig\.(\w+)\.(\w+)", source):
        if section not in config:
            problems.append(f"{path}: Config.{section} does not exist")
        elif key not in config[section]:
            problems.append(f"{path}: Config.{section}.{key} does not exist")
    for section in re.findall(r"\bConfig\.(\w+)\b(?!\.)", source):
        if section not in config and section not in ("GameName",):
            problems.append(f"{path}: Config.{section} does not exist")
    for alias, section in aliases.items():
        if section not in config:
            continue
        for key in re.findall(rf"(?<![\w.]){alias}\.(\w+)", source):
            if key not in config[section]:
                problems.append(f"{path}: {alias}.{key} (Config.{section}.{key}) does not exist")


def main():
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), ".."))
    config = parse_config(root)
    remotes = parse_remotes(root)
    problems, notes = [], []
    files = []
    for directory, _, names in os.walk(os.path.join(root, "src")):
        for name in sorted(names):
            if name.endswith(".luau"):
                files.append(os.path.join(directory, name))
    files.append(os.path.join(root, "tests", "run.luau"))

    for path in sorted(files):
        with open(path, encoding="utf-8") as handle:
            source = handle.read()
        rel = os.path.relpath(path, root)
        tokens = tokenize(source, rel, problems)
        check_blocks(tokens, rel, problems)
        check_ambiguous_calls(tokens, rel, problems)
        check_names(tokens, rel, problems, notes)
        if "/tests/" not in path:
            check_references(path, source, root, config, remotes, problems)

    for note in notes:
        print("note:", note)
    for problem in problems:
        print("ERROR:", problem)
    print(f"\nChecked {len(files)} files: {len(problems)} errors, {len(notes)} notes.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
