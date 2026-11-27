# Style frames (UI overhaul)

Static mockups for choosing the new look. Not game code; nothing here is imported by `src/`.

- `index.html?theme=a|b|c&view=board|sheet` renders a frame (serve the repo with `npm run dev`, open `/design/frames/index.html`).
- `a-*` Tactical: gunmetal, olive UI accents, crosshair grid, hazard hatching on restricted zones.
- `b-*` Phosphor: monochrome green CRT radar with scanlines; only threats break the monochrome.
- `c-*` Ops: graphite and ice blue, dot grid, thinner lines, no texture.

All three share the same structure: top strip (menu, pause, speed, sector, next wave), persistent console (Deploy / Asset / Log), the network board (ingress nodes, Core, restricted subnets, DMZ), the towers (Inspector, Rate Limiter, Sandbox, with tiers and branches) and layered malware.

## Round 2 (current)

`v2.html?view=board|towers|ui`: C's palette with B's atmosphere toned down, tilted top-down volume, light from active parts, role colors (damage cyan, area teal, support violet), and the button component states. Renders: `v2-board.png`, `v2-towers.png`, `v2-ui.png`.
