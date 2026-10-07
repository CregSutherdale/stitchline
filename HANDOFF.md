# Stitchline HANDOFF

**Live:** https://cregsutherdale.github.io/stitchline/  (repo CregSutherdale/stitchline, public; `main` = source, `gh-pages` = built site)

## State (2026-10-07): v2 SHIPPED (round 2)
- 180-level campaign (16 chapters), Daily Stitch (hard band, streak calendar), Endless, Quilt Chest with sewn 3x3 quilts + reveal, Sewing box (thread/fabric unlocks by stars), Stats page, clock modes, PWA offline.
- New clues: **needle's eye** (pass straight through, travelling the arrow's way: global direction deductions) taught at L121; **seams** (cross exactly N times: counting/parity deductions) taught at L126.
- Save: storage key stays `stitchline.v1`; schema `v: 2`. `store.migrate()` is pure and idempotent; a raw pre-migration copy is kept once in `stitchline.backup.v1`. Never renumber levels 1-120 (saves key on level id); gate 1 checks they are byte-identical to `tests/fixtures/campaign_v1_120.json`.

## Gates (all must pass before deploy)
1. `npm run test:puzzles` -> 180 levels + 60 Daily dates unique by the independent DFS, exact regen, dailies in band [115,175], levels 1-120 frozen, curve rising (teaching levels exempt). Log: docs/gate1_puzzles.log.
2. `npm run build && npm run test:play` -> real touch/mouse drags at 390x844 incl. L121 eye tutorial, L126 seam tutorial, a 10x10 seam+eye level, erratic pass, 0 errors. Also run with the live URL as arg after deploy.
3. `node tools/test_migration.mjs [url]` -> the REAL v1 save captured from the live v1 build (tests/fixtures/save_v1_live.json) survives: levels, stars, quilt, hints, daily, in-progress level, settings.
4. `node tools/shots.mjs --w W --h H` for 390x844, 430x932, 375x667 -> docs/shots/<WxH>/. Look at them.

## How it works
- `src/core/logic.js` edge solver (+ eyes: axis combo + chain-orientation votes; seams: exact-count propagation). `src/core/dfs.js` independent verifier (seam walls when saturated, eye axis, seam reachability).
- `tools/extend_campaign.mjs` appended 121-180 only (candidates cached in .cache/, picks verified by DFS). `tools/build_campaign.mjs` is the v1 builder for 1-120: do NOT rerun it (it would renumber).
- Daily from 2026-10-07: 9x9, deterministic retries (<=40) until score is in DAILY_BAND; before that date the v1 rule is kept. Today's Daily is pre-generated in the worker and cached in the save.

## Traps
- Edge headless launcher detaches: `tools/cdp.mjs` reads `DevToolsActivePort`, records the browser PIDs it launched and kills only those (another agent runs Edge validators on this machine).
- Canvas in CSS grid: give canvases a small width/height attribute or wrap them, or the 300x150 intrinsic size distorts the grid.
- `.sw` is the settings toggle class; sewing-box tiles use `.swatch`.

## Deploy
`node build.mjs` -> copy `dist/*` into `.deploy/` (clone of gh-pages) -> commit (trailer) -> push. Never --force.

## Next ideas
- 11x11/12x12 need a stronger independent verifier (cell DFS cannot finish them).
- The "nice deduction" cue was skipped on purpose: any cue for a correct section leaks the answer.
