# 🥊 LAUNCH PARTY

**A roguelike knockback brawler for Roblox.** Punch your friends off floating islands, draft
ridiculous perk builds between rounds, and try not to be the one who falls into the void.

## The pitch

- **Heat, not health.** Every hit raises your Heat %. The hotter you are, the farther you fly.
  Nobody "dies" from damage. You only lose by getting launched off the island.
- **Three verbs, lots of depth.** Tap to jab, hold to charge a finisher, dash to bump people,
  and save your air-dash to recover when you've been launched off the edge.
- **Roguelike draft.** After every round, each player picks 1 of 3 perk cards. Perks stack all
  match long (Glass Cannon + Titan + Double Dash, anyone?). Low placers get better rarity odds.
- **Every round is different.** Random arena shapes (Disc, Crossroads, Donut Hole, Twin Isles)
  and events (Meteor Shower, Low Gravity, Ice Rink, The Sweeper, Gusty Skies). After 45 seconds
  the edges start crumbling (Sudden Death).
- **The bounty crown 👑.** The match leader wears a crown. KO them for a bonus point, so
  everyone gangs up on the leader and matches stay close.
- **Reasons to come back.** Saved XP and levels unlock new perks for your draft pool, plus
  titles (Rookie → Living Legend) and trail colours. Your first win each day earns double XP.
- **Never empty.** Bots fill matches up to 4 fighters, and practice dummies wait in the lobby.

## Core loop

```
Lobby (spar with dummies, watch the arena)
  → Round: spawn → 3-2-1 → brawl → last one standing (sudden death after 45s)
  → Draft: pick 1 of 3 perks (stacks for the rest of the match)
  → ×5 rounds → Champion + XP + unlocks → next match
```

Points: 1st/2nd/3rd in a round = 3/2/1, every KO = +1, KO on the crowned leader = +1 bounty.

## Controls

| Action | PC | Gamepad | Mobile |
|---|---|---|---|
| Jab | Click | R2 | PUNCH button (tap) |
| Charged punch | Hold click, release | Hold R2 | Hold PUNCH |
| Dash / air-dash recovery | Q or Shift | X / L2 | DASH button |
| Pick a perk | Click or 1 / 2 / 3 | D-pad + A | Tap |

## Opening it in Roblox Studio

**Option A, no tools needed:** open `LaunchParty.rbxlx` in Roblox Studio and press **Play**.
The world (lobby, arena, scenery) is generated at runtime, so the edit view starts empty.

**Option B, Rojo (recommended for development):**
```bash
rojo serve           # live-sync into Studio with the Rojo plugin
rojo build -o LaunchParty.rbxlx
```
Or rebuild without Rojo: `python3 tools/build_rbxlx.py`.

To make progress save in Studio, publish the place and enable
*Game Settings → Security → Enable Studio Access to API Services*. Without that the game
still runs and tells you that progress isn't being saved.

## Architecture

All gameplay is **server-authoritative**. Clients only send *requests* ("I started charging",
"punch toward this direction", "dash this way"). The server validates them (cooldowns, state,
rate limits, NaN/huge vectors), resolves hits against server-side positions, and applies
knockback. The only thing the client does itself is move its own character, which it physically
owns. Bots are owned by the server and moved there.

```
src/shared/                 ReplicatedStorage.Shared
  Config.luau               every tuning number in one place
  Knockback.luau            pure launch-curve math          (unit tested)
  Perks.luau                perk defs + stat aggregation    (unit tested)
  Draft.luau                weighted rarity card rolls      (unit tested)
  Progression.luau          levels, titles, match XP        (unit tested)
  Movement.luau             knockback/tumble + dash physics (client & server)
  Net.luau                  remote registry
  Cosmetics.luau            heat colours, trails, rarity colours
src/server/                 ServerScriptService.Server
  init.server.luau          bootstrap
  Services/ArenaService     lighting, lobby, procedural arena, crumbling, ice
  Services/FighterService   one registry for players, bots and dummies
  Services/CombatService    punch/charge/dash validation, hit resolution, dash bumps
  Services/BotService       bot rigs, animation and AI (chase, edge-avoid, charge, recover)
  Services/EventService     round events
  Services/DraftService     per-round perk draft
  Services/DataService      DataStore profiles with retries, autosave, BindToClose
  Services/RoundService     match state machine, KOs, placements, crown, rewards
src/client/                 StarterPlayerScripts.Client
  Controllers/Input         input, aim assist, client-side prediction
  Controllers/Effects       knockback, hit FX, heat popups, KO blasts, camera shake
  Controllers/HUD           status, heat meter, scores, kill feed, results
  Controllers/Draft         perk card picker
```

## Testing

- `python3 tools/check_luau.py` is a static checker for this codebase. It checks block and
  bracket balance (including Luau if-expressions), ambiguous `(` statements, locals used before
  they're declared, unknown globals, require targets, remote names and Config keys.
- `luau tests/run.luau` runs 19 unit tests for the pure gameplay modules: knockback curve,
  perk stacking and clamps, draft rarity/luck, levels and XP. It needs the
  [Luau CLI](https://github.com/luau-lang/luau/releases).

## Tuning cheat sheet (`Config.luau`)

- Matches too long? Lower `Match.RoundsPerMatch` or `Match.SuddenDeathAt`.
- Launches too weak or strong? `Combat.HeatScale` sets how much heat matters. `JabKnock` and
  `ChargeKnockMult` set raw power.
- Sounds use built-in engine audio. Swap `Config.Sounds` for your own uploads.

## Roadmap (next stages)

1. Custom punch animations + uploaded SFX for extra crunch.
2. More events (Bouncy Castle floor, Lights Out, Giant Mode) and arena shapes.
3. Perk synergies ("set bonuses") and a few cursed perks with big upsides.
4. Cosmetic shop (trails, KO effects) using in-game currency; daily challenges.
5. Ranked queue / private servers via TeleportService.
