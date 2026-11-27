# Style frames (UI overhaul)

Static mockups for choosing the new look. Not game code; nothing here is imported by `src/`.

- `index.html?theme=a|b|c&view=board|sheet` renders a frame (serve the repo with `npm run dev`, open `/design/frames/index.html`).
- `a-*` Tactical: gunmetal, olive UI accents, crosshair grid, hazard hatching on restricted zones.
- `b-*` Phosphor: monochrome green CRT radar with scanlines; only threats break the monochrome.
- `c-*` Ops: graphite and ice blue, dot grid, thinner lines, no texture.

All three share the same structure: top strip (menu, pause, speed, sector, next wave), persistent console (Deploy / Asset / Log), the network board (ingress nodes, Core, restricted subnets, DMZ), the towers (Inspector, Rate Limiter, Sandbox, with tiers and branches) and layered malware.

## Round 2 (current)

`v2.html?view=board|towers|ui`: C's palette with B's atmosphere toned down, tilted top-down volume, light from active parts, role colors (damage cyan, area teal, support violet), and the button component states. Renders: `v2-board.png`, `v2-towers.png`, `v2-ui.png`.

## Round 3: tower tiers

`v3-towers.html` (render: `v3-towers.png`, 1280x720): every tier rebuilds the structure. Footprint grows from a small unit to a full cell, height roughly 2.5x, materials go bare > plated > reinforced, modules attach physically (fins, clamp arms, pods on arms, pylons, satellites on pipes, lattice uplink), and the number of lit parts grows. Includes an actual-size strip (32 px cells) and a small in-context board.
