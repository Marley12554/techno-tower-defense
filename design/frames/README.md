# Style frames (UI overhaul)

Static mockups for choosing the new look. Not game code; nothing here is imported by `src/`.

- `index.html?theme=a|b|c&view=board|sheet` renders a frame (serve the repo with `npm run dev`, open `/design/frames/index.html`).
- `a-*` Tactical: gunmetal, olive UI accents, crosshair grid, hazard hatching on restricted zones.
- `b-*` Phosphor: monochrome green CRT radar with scanlines; only threats break the monochrome.
- `c-*` Ops: graphite and ice blue, dot grid, thinner lines, no texture.

All three share the same structure: top strip (menu, pause, speed, sector, next wave), persistent console (Deploy / Asset / Log), the network board (ingress nodes, Core, restricted subnets, DMZ), the towers (Inspector, Rate Limiter, Sandbox, with tiers and branches) and layered malware.
