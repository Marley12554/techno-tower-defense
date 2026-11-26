# Where this engine comes from

`engine/src/{rng,dmath,grid,runner}.ts` are verbatim copies from `engine/src` of
[Marley12554/mobile-game-library](https://github.com/Marley12554/mobile-game-library), which
copied them from [Marley12554/ball-sim](https://github.com/Marley12554/ball-sim) commit
`8189c929512d0efd769770db805253dca803e847` (2026-11-25). The ball-sim project owns them.
`index.ts` is a trimmed export list for just these files.

Only these four parts are used here: a tower defense doesn't need the physics world, since
malware follows grid paths instead of colliding.

Rules:

- Don't edit these files. A fix goes into ball-sim first, then gets copied over.
- Game code (pathing, towers, rendering, input) lives in `src/`, never here.
