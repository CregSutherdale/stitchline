# Stitchline HANDOFF

**Live:** https://cregsutherdale.github.io/stitchline/  (repo CregSutherdale/stitchline, public; `main` = source, `gh-pages` = built site)

## State (2026-10-06): SHIPPED v1
- 120-level campaign, Daily Stitch (date-seeded, streak), Endless (Medium/Hard/Expert), Quilt Chest, stars/par/best times, hint budget, PWA offline.
- Gates: GATE 1 `npm run test:puzzles` exit 0 (150/150 unique via independent DFS, exact regen, chapter means strictly rising, Spearman 1.000). GATE 2 `npm run test:play` exit 0 locally AND against the live URL (logs in docs/).
- Screens: docs/shots/*.png.

## How it works
- Solver `src/core/logic.js`: Hamiltonian path = cycle through a virtual node V; edge states; propagation = degree + precomputed clue combos + premature-cycle + connectivity + number-chain order. Grader = probe rounds (single-edge what-ifs) then search; score = sum of log2(unknowns/found) per round (+ heavy term if search needed).
- Verifier `src/core/dfs.js`: unrelated cell DFS (dead ends, connectivity, parity, clue forward-check).
- Generator `src/core/gen.js`: deterministic (node budgets only, never wall-clock), so Daily/Endless are identical in Node and browsers.
- Campaign: `npm run campaign` picks best-of-K per slot near `targetScore(i)`, keeps teaching levels 1,2,4,5,9,15 fixed, sorts the rest by score.

## Traps
- Edge headless launcher detaches: `tools/cdp.mjs` reads `DevToolsActivePort` and kills by profile tag (same fix as gulp's shot_cli).
- Clue combos must be deduped per edge (shared clue<->neighbour edge) or propagation becomes unsound.
- `navigator.vibrate` before first tap logs an error in Chromium: gated on `userActivation.hasBeenActive`.

## Deploy
`node build.mjs` -> copy `dist/*` into `.deploy/` (clone of gh-pages) -> commit (trailer) -> push. Never --force.

## Next ideas
- Daily scores vary (18-158); raise daily K or add a minimum score.
- Big empty space above/below the board on tall phones; could enlarge the status/teach area.
- Optional: per-chapter thread colours, a "mistake check" toggle that hides red rings for purists.
