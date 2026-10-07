# Stitchline

A cozy, genuinely hard threading puzzle for phones, made for Amanda.
Play: **https://cregsutherdale.github.io/stitchline/** (iPhone: Safari, then Share, then Add to Home Screen).

Drag one continuous thread from the needle through every hole exactly once (up/down/left/right).
Clues: pins (closed holes), knot (thread must end there), white bead (straight through, turn next to it),
dark button (turn on it, straight through both neighbours), numbered buttons (visit in order).
Every puzzle has exactly one solution, proven by two independent solvers.

## Modes
- **Campaign**: 120 seeded levels in 12 chapters, 5x5 to 10x10, ordered by measured solver difficulty.
- **Daily Stitch**: one date-seeded hard puzzle per day (8x8/9x9), streaks.
- **Endless**: Medium (7x7) / Hard (8x8) / Expert (10x10), generated in a Web Worker.
- **Quilt Chest**: every solved thread becomes a procedural quilt block.
- Stars (par time + no hints), best times, hint budget (earn +1 per hint-free solve, max 10). Undo/reset free.

## Code
| Path | What |
|---|---|
| `src/core/logic.js` | Edge-based solver (Hamiltonian cycle via virtual node, clue combo propagation, cycle/connectivity) + difficulty grader |
| `src/core/dfs.js` | Independent cell-by-cell DFS verifier (no shared code) |
| `src/core/gen.js` | Generator: pins, Warnsdorff + backbite random path, derive clues, strip while unique |
| `src/core/campaign.js` | Level schedule, target curve, Daily/Endless params |
| `src/data/campaign.json` | The 120 built levels (seed + source slot each) |
| `src/board.js`, `src/game.js`, `src/main.js` | Canvas board + input, puzzle session, screens |
| `src/art.js`, `src/audio.js` | Procedural fabrics/beads/needle/quilt blocks; WebAudio synth SFX |

## Commands
- `npm run campaign` rebuild levels (~3 min, worker threads)
- `npm run test:puzzles` GATE 1 (150 puzzles unique by independent DFS, regen exact, curve rises)
- `npm run build` then `npm run test:play` GATE 2 (real touch/mouse drags in headless Edge 390x844)
- `npm run shots` phone screenshots into `docs/shots/`
- Deploy: `node build.mjs`, copy `dist/*` into `.deploy/` (clone of `gh-pages`), commit, push.

## Credits
Music: "Peaceful Village" and "Wood Forest Town" by HydroGene (16-bit RPG Music pack, free use).
All art and sound effects are procedural code. No AI-generated art or audio.
