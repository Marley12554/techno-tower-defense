# Techno Tower Defense: project brief

Source of truth for scope and decisions until the user says otherwise. Working title comes from the repo name; the game has no final name yet.

## What this is

A full tower defense with a cybersecurity theme. You defend a **Core** (a server) from **malware** that travels across a circuit-board grid, by building and upgrading **defenses** (towers).

- Clean 2D look, built to be deep: tower roles, synergies, counters, mazing, branching upgrades.
- No ads, no paywalls, no energy timers, no pay-to-skip. It can be hard. Difficulty comes from decisions, not friction.
- **No active abilities for now.** Only revisit if each ability has a real cost or tradeoff.

## Platform and layout

- TypeScript, Vite, Canvas 2D, Vitest. `npm run dev`, `npm test`, `npm run build`, `npm run tune`.
- **Landscape**, phones held sideways, also works with a mouse. Respects safe areas. Portrait on a touch device shows a "rotate your phone" screen.
- Deploy: `.github/workflows/pages.yml` tests, builds and publishes with the official Pages actions on pushes to `main` or the dev branch. One-time setup: Settings > Pages > Source: GitHub Actions.
- **Repo:** standalone repo (`techno-tower-defense`), not `mobile-game-library/games/td` as the original handoff said. The user created this repo for the game. Everything is self-contained so it can be moved into the library later.
- `engine/` holds verbatim copies of four ball-sim engine files (`Rng`, `dmath`, `SpatialHash`, `Runner`). Read `engine/SOURCE.md`. Don't edit them; describe needed engine changes to the user.
- No collection shell. Save, settings and menu code stay separate from gameplay.

## Core loop

- Grid map with spawn ports and the Core. Towers go on any open cell; malware paths around them (BFS flow field from the Core, 4-connected, prefers going straight so routes look like circuit traces).
- A placement that would cut every route, or trap malware already on the board, is invalid; the ghost turns red with a short reason. Malware on the board re-paths at the next cell (and turns around mid-segment if the new route runs back).
- The live route is drawn as a glowing data trace with packets streaming toward the Core; it animates when it changes, and the drag ghost previews the new route and its length change ("Route +4").
- Economy: bits from kills and wave clears. Sell = full refund until the next wave starts, 70% after. Calling the next wave early (once the current one has finished spawning) pays a small bonus.
- Hand-designed waves with an untimed build phase between them, next-wave preview, pause, 1x/2x. Lose at 0 integrity; win by clearing every wave.

## Progression philosophy (most important)

**Progress must change what the player has to decide, not just the numbers.**

1. New problems, not bigger versions of old ones. Each malware type needs a different answer.
2. Towers are roles, not upgrades. None strictly better than another.
3. Branching upgrades that exclude each other. Most of the depth comes from here.
4. Hand-made maps. **Test for every map:** it must ask for something the previous three didn't.
5. Permanent progression: small and capped, mostly options. **Confirm the size of the permanent stat layer with the user before building it.**
6. Possible loadout limit once 6+ towers are unlocked. **Don't build without confirming.**

## Planned content (refine with the user)

Defenses (7 to 10 total, start with 3): Packet Filter, Throttle, Sandbox Mortar; later Scanner, Decryptor, Arc Coil, Beam Emitter, Honeypot, Quarantine, Overclock Relay. Each new tower arrives in the same world as the malware it answers.

Malware: Worm, Spyware, Trojan (in the slice); later Rootkit, Encrypted packet, Ransomware, Polymorphic, Zero-day bosses.

Structure: 5 worlds of about 6 maps, 15 to 25 waves each, one new malware and its answer per world, boss map at the end. Endless mode later.

## Visual direction (overhaul agreed, not built yet)

The step 2 slice looked like "a tower defense with a neon skin" and is being replaced. Agreed direction, from two rounds of style frames in `design/frames/` (`v2.html` is current):

- **Palette:** C's graphite and ice blue (clean, modern, secure). **Atmosphere:** B's scanlines and vignette at low strength, as a finish, spiking on events (Core hit, new threat). Not a mask over a flat scene.
- **Depth, not glow:** tilted top-down volume (top face plus a visible front face, soft shadow down-right; the grid stays readable), material gradients with a lit top edge, a recessed traffic channel, raised infrastructure. Light comes only from active things (lenses, cores, beams, threats) and pools on the board.
- **A network, not a motherboard:** ingress nodes (WAN-1...), the Core as a crown-jewel server (CORE · DC-01), hatched isolated subnets, a DMZ of racks, endpoints. Coordinates on the board edges.
- **Role colors** (cool = friendly, hot = threat still holds): Damage cyan (Inspector, Beam Emitter), Area teal (Sandbox, Arc Coil), Support violet (anything that helps other towers directly or indirectly: Rate Limiter, Quarantine, Honeypot, Scanner, Decryptor, Overclock Relay). Same role = same color, told apart by silhouette.
- **Rendering: real-time 3D for the play field** (three.js, WebGL, fixed orthographic camera at the tilted angle; DOM UI on top). Chosen over pre-rendered sprites because towers are "alive" (see below). Keep it phone-friendly: instancing/merged geometry, simple materials, resolution scaling. Tower models live in `src/render3d/` and are reviewed in the Tower Lab (`design/lab.html`, on Pages at `/design/lab.html`).
- **Towers are alive, not anthropomorphic:** cybersecurity tools, not Pixar robots. No faces (eyes, lids, brows) and no heads that turn to look or aim. Personality comes from how the machine behaves: tempo, light state (idle hum, scan sweeps, surge on contact, steady lock) and functional mechanical motion (radar bars spinning, an iris tightening, vents, a halo contracting, panels unsealing). Targeting shows through light from fixed emitters (trace, beam, brackets), never by swiveling the body. Idle, alert and firing states blend.
- **Inspector (round 10, built, awaiting review):** the v3 2D Array built in 3D (`src/render3d/inspector.ts`), worked backwards from Mk III. Growth table: head and lens (same at every tier, gains lens rings) / column (Mk I pedestal > armored, vented lower stage > + telescoping upper stage) / conduits (footing trim > up the lower stage > up both stages) / radar pods (0 > 1 > 3 spinning slotted array bars on braced posts; flat bars, not dishes, so the dish stays Remote's) / plinth (hex footing > + low octagon > + wide foot with rim lights) / collar (Mk II) that projects the halo (Mk III) / antenna (short mast > telescoped). Personality: bars spin steadily (an earlier stop-and-go stutter read as a fault and was removed), lens flickers, scan pings sweep the board; on contact the bars snap to the bearing and sweep across it, the iris tightens, the halo contracts, a trace locks and the lens fires short bursts. Round 4-8 Inspectors (camera on a yoke, eye in a socket, robot) were all departures from v3 and are only in the compare menu (`legacy/r8-*.ts` etc.).
- **Each tower has a personality** (not one shared "turn to face" behavior): Inspector = nervous and hyper-vigilant (idle snap-glances with overshoot and double-takes; alert hard lock, iris closes to focus, burst fire); Rate Limiter = calm, heavy, inevitable (never "looks", powers up slowly, the field tightens); Sandbox = guarded, ritualistic heavy weapon (sealed with a heartbeat glow, unseals in stages, charges, recoils, reseals). Only the Inspector is built so far.
- **One eye per tower:** the single part that looks at hostiles, always the brightest thing on it (Inspector lens/dome, Limiter core, Sandbox core; Remote's eye moves to the dish feed and the base core stays covered).
- **Generations:** a tier that changes generation must read as new technology, not more size. Gen 1-2 = machined gunmetal with bright bevelled trim; gen 3 = pale clear-coated ceramic, dark glass visors and light inlaid in the shell (`GEN` materials in `kit.ts`). (Round 5's white-ceramic Mk III was rejected as an incoherent jump; generation changes now show as added parts and light on the same family, not a material swap.)
- **Construction:** parts snap to real dimensions (helpers in `kit.ts`); `findClipping()` flags interpenetrating parts (`/design/lab.html?check` logs it; parts that are meant to overlap are tagged with `joint()`).
- **Tower design rules (every tier):** 1) **design from the final tier backwards**: each part of Mk III (or of both branch finals) gets a growth path, and earlier tiers are earlier stages of that machine. Nothing appears that isn't in the final tier, and nothing that appears is ever removed (v3's Mk II failed this: its fins, hood and second lens vanished at Mk III); 2) every tier must structurally reform the machine (new subsystems, parts that change form or function). **Size is a byproduct, never the upgrade**: if tier N+1 is tier N's parts scaled up, it fails; growth that comes from real reform is fine; 3) every visual change maps to what the upgrade does (optics = damage, cooling = fire rate, height = range, pod count = targets/bomblets); 4) every part has a mount, only energy floats; 5) one industrial construction language. Before building the Rate Limiter and Sandbox, write their growth tables (from Chokepoint, Cluster II and Remote II) and get them approved.
- **Defeat screen:** "SYSTEM COMPROMISED" in big white corrupted text over a red VHS catastrophic-failure background (static, rolling tracking band, tears, scramble-in, random letter corruption), breach details typed in, stats, retry/menu. Built in `design/lab/compromised.ts`, to be moved into the game. A matching victory screen is still to design.
- **Round 9 (rejected):** "hardware base plus a construct of light" sketches (`design/sketches.html`) went too far: floating lines and rings read weak, samey and not like competent security. What the user wants is v3 Mk III's fusion: the machine owns the silhouette, light is inlaid in it or produced and held by a mechanism, and at most one holographic element per tower (the Array's halo, Chokepoint's energy ring).
- **Towers are objects that look like their function, never turrets:** Inspector = sensor with a lens that beam-locks and brackets its target; Rate Limiter = iris that pinches the link; Sandbox = containment box that isolates then detonates. Tiers grow taller and add modules; branches have their own silhouettes (Remote = relay mast).
- **Malware are floating packets; health is layers:** each hit strips a shell, so it shrinks and runs hotter until the last layer shatters. No health bars. Trojans are disguised in friendly colors with a hairline red seam.
- **UI components:** three surface levels (base, raised, inset). Primary buttons are raised with an accent border, lit top strip and inset cost chip, with distinct hover, pressed and disabled states. No flat solid-fill buttons, no glass, no dashed lines.
- **Layout:** top strip (square menu, pause and speed buttons at top left, sector, next wave, wave count) and a persistent right console (Deploy / Asset / Log tabs, newest log line in the footer). Accepted: the board shrinks ~15-20% on phones.
- **Kill feedback:** last layer shatters with a flash and pitch-varied sound; kills close together merge into one bits token ("+14"); no damage numbers.
- **Entering a map:** a short "secure session" handshake and zoom into the network, not a side wipe.

## Decisions made so far

- Slice malware: **Worm** (swarm, mortar answers it), **Spyware** (fast, steals 12 bits on leak, Throttle + Filter answer it, mortar shells land behind it), **Trojan** (slow and tough, bursts into 5 worms on death).
- Branching tree: **Sandbox Mortar**: Hardened Shell, then **Cluster** (bomblets) *or* **Long Range** (range, heavy single hits), two tiers each. Filter and Throttle have two linear tiers. Throttle tier 2 makes slowed malware take +25% damage.
- Drag from a card to place; tapping a card (or pressing 1/2/3) arms it for tap-to-place, which stays armed for chain-building. On touch, a dragged ghost sits ~0.7 cells above the finger, with a row/column crosshair.
- Upgrades: tap a card to preview (stat diffs, range ring), tap its price to buy. Desktop previews on hover. Selling needs a confirming second tap.
- Stars: win with full integrity = 3, with `stars[1]`+ = 2, otherwise 1.
- **Renames for the overhaul:** Packet Filter -> **Inspector**, Throttle -> **Rate Limiter**, Sandbox Mortar -> **Sandbox** (branches **Cluster** / **Remote**).
- **Core repair:** paid repair between waves, getting pricier each time (option A). Not built yet.
- **Multi-cell towers:** wanted later. Standard towers stay 1x1, specific heavy towers can be 2x2, no 3x3 on 18x10 maps, upgrades never change footprint.
- **Malware behavior ideas (suggested, not confirmed):** worms self-replicate if not killed fast; spyware steals bits and then tries to leave, killing it on the way out returns them.
- **Known slice bugs to fix in the overhaul:** route tie-break isn't mirror-symmetric (fixed E,S,N,W order); the placement preview looks like a second route; the route starts outside the board and isn't clipped; malware use random lateral offsets instead of lanes.

## Status

Step 2 (polished vertical slice) is built: one map (Boot Sector, 15 waves), 3 towers, 3 malware, drag-to-place with ghost/snap/route preview/invalid reasons, the integration animation (traces grow to neighbors, pulse runs through the network, solder sparks, glow ramp, snap sound), the mortar's branching tree, inspector with targeting and sell, banners, bits flying to the counter, core glitch/alarm, title/briefing/pause/results screens, tutorial coach marks, new-threat briefs, synth sound throughout. The user playtested it and asked for a full visual/UI overhaul (see Visual direction). Style frames v2 and the v3 tower lineup were approved; towers are now real 3D in the Tower Lab. Round 4 feedback (boring materials, no personality, weak tier jumps, clipping) led to round 5: the Inspector lineage rebuilt to the quality bar (personality, gen-3 ceramic Mk III with drones, clean clipping check). Measured on the user's iPhone 16 Pro: locked 60 FPS (30 in Low Power Mode, which is iOS's cap for web pages). Round 5's camera-on-a-yoke read as a turret/spotlight and its Mk III as a different tower; round 6 replaced it with the eye-in-a-socket concept and light-field attack. Round 7: both Inspector designs made coherent; round 8: A restored to round 5's actual look, round 6 restored to the compare menu, light field rebuilt as rays through haze (constant core size, calmer field, readable eyes) for a fair A/B choice; lab got solo mode, panning and the A/B switch. Round 9: both rejected as projectors; the construct-of-light sketches were rejected too. Round 10: back to the approved v3 lineup, built faithfully in 3D with the backwards growth-table method; the Inspector is built. **Next: user reviews the round 10 Inspector; then growth tables for the Rate Limiter and Sandbox, build them, then the game overhaul.**

The level JSON format and a heuristic bot were started early because they were cheap (step 4 is not otherwise done).

## Code map

- `src/game/` simulation only, no DOM. `board.ts` (terrain, BFS flow field, routes), `sim.ts` (malware, towers, projectiles, waves, economy, placement checks, events), `data.ts` (tower and malware tables, upgrade trees), `levels.ts`, `bot.ts` (tuning bot), `types.ts`.
- `src/render/` canvas: `renderer.ts` (all live drawing and event-to-effect mapping), `board-layer.ts` (static board), `sprites.ts` (pre-rendered sprites), `fx.ts` (pooled particles/rings/text/tokens), `layout.ts`, `palette.ts`.
- `src/ui/` DOM: `app.ts` (screens), `play.ts` (game loop, input, placement), `hud.ts` (side panel, banners, coach, briefs), `inspector.ts`, `audio.ts` (synth), `styles.css`.
- `src/render3d/` three.js tower models and behavior (`kit.ts` materials and part builders, `core.ts` Tower3D base, `inspector.ts`, `towers.ts` RateLimiter / Sandbox and `buildTower`).
- `src/render3d/legacy/` round 4, 5, 6 and 8 models (with their light fields and pods), kept only so the lab's hidden ⋯ compare menu can show them (with the original 2D frames).
- `design/` style frames, the Tower Lab (`lab.html`, `lab/main.ts`) and the defeat screen (`lab/compromised.ts`). Built to Pages alongside the game.
- `src/meta/save.ts` saves and settings.
- `levels/*.json` maps. Grid legend: `.` open, `#` chip, `o` capacitor, `S` spawn, `C` Core.

## Tuning

`npm run tune -- [levelId] [seeds]` plays each map with several bot builds. The bot buys in a fixed order and places for route coverage; it barely mazes, so a human should beat it. Current target for map 1: the mixed bot wins with roughly 8 to 10 of 20 integrity, filters-only loses, reckless early calling loses. Main knob: `hpGrowth` in the level JSON (0.17 now; 0.20 is a cliff).

Performance: sim steps cost ~0.05 ms. Rendering is fill-bound; the renderer lowers its canvas resolution automatically if frames stay slow.

## Working with the user

- The user is a CS + math student and builds side projects with Claude doing most of the coding. The game ideas are theirs.
- When a message mixes questions and change requests, answer the questions first, then implement, narrating each step. If they say not to code yet, only answer.
- Be direct, push back when something is actually wrong, in proportion to the problem. Don't overstate scope: this is a 2D mobile web game.
- Build small slices and get the user's reaction before building more. Show screenshots of visual changes. Push work when a step is done.
