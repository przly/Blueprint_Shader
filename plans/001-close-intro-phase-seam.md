# 001 — Close the dead-time seam between intro phase 1 and phase 2

- **Status**: DONE
- **Commit**: 4283cdc
- **Severity**: HIGH
- **Category**: Interruptibility / continuity (motion has a literal stop-then-restart, not a taste issue)
- **Estimated scope**: 1 file (`main.js`), 1 constant value changed

## Problem

The load intro is built from two camera "phases" — phase 1 (bird's-eye →
resting-pose rotation + a zoom pull-back/settle) and phase 2 (pan+zoom push
into Camera Target 1) — driven by three independent tween systems that all
read from a shared set of `MODEL_LOAD_*` millisecond constants in
`main.js:2742-2801`. The three systems are:

1. Pitch/rotation — `tweenCubeRotationTo`, driven by `cubeRotResetStartTime` (declared `main.js:1240`, stepped in `renderCubeFrame` in the `if (cubeRotResetStartTime !== null)` block preceding line 4647).
2. Phase-1 "Model size" zoom — same `tweenCubeRotationTo` call, its `zoomDurationMs`/`zoomEasing` params (`cubeRotResetZoomDurationMs` etc.).
3. Phase-2 camera-target pan+zoom — `startIntroCameraTargetTween` (`main.js:2567`), driven by `introCamTargetTweenActive` (declared `main.js:2551`) and stepped in `renderCubeFrame`'s `if (introCamTargetTweenActive)` block at `main.js:4662`.

Current constant values (`main.js:2742-2801`):

```js
// main.js:2742-2801 — current
const MODEL_LOAD_ROTATION_INTRO_DELAY_MS = 1000;
const MODEL_LOAD_ROTATION_INTRO_MS = 2000;
const MODEL_LOAD_INTRO_PHASE_GAP_MS = 2000;
const MODEL_LOAD_PHASE_OVERLAP_MS = 1000;
const MODEL_LOAD_PHASE1_TOTAL_MS = MODEL_LOAD_ROTATION_INTRO_DELAY_MS + MODEL_LOAD_ROTATION_INTRO_MS;
const MODEL_LOAD_PHASE2_PAN_MS = 3000;
const MODEL_LOAD_PHASE2_ZOOM_MS = 1000;
const MODEL_LOAD_PHASE2_ZOOM_DELAY_MS = 2000;
const MODEL_LOAD_PHASE2_START_MS = MODEL_LOAD_PHASE1_TOTAL_MS + MODEL_LOAD_INTRO_PHASE_GAP_MS - MODEL_LOAD_PHASE_OVERLAP_MS;
const MODEL_LOAD_TOTAL_INTRO_MS = MODEL_LOAD_PHASE2_START_MS
  + Math.max(MODEL_LOAD_PHASE2_PAN_MS, MODEL_LOAD_PHASE2_ZOOM_DELAY_MS + MODEL_LOAD_PHASE2_ZOOM_MS);
const MODEL_LOAD_YAW_DURATION_MS = MODEL_LOAD_TOTAL_INTRO_MS + 1000;
```

Working out the absolute timeline these produce (all times ms from page
load) shows two literal dead-motion windows — not a taste/curve issue, an
actual stop:

| Time (ms) | Pitch (rotation) | Phase-1 zoom (`cubeSizePercent`) | Phase-2 pan (`cameraTargetCurrent`) | Phase-2 zoom (`cameraTargetZoomCurrent`) |
|---|---|---|---|---|
| 0 | idle (bird's-eye) | **moving** (0→5000) | idle | idle |
| 1000 | **moving** (1000→3000) | moving | idle | idle |
| 3000 | landed | moving | idle (phase 2 hasn't started — starts at 4000) | idle |
| **3000–4000** | landed | moving (decelerating, ~66-80% through an ease-out) | **idle** | idle |
| 4000 | landed | moving | **moving** (4000→7000) | idle |
| 5000 | landed | **landed** | moving | **idle** (phase-2 zoom delay ends at 4000+2000=6000) |
| **5000–6000** | landed | **idle** | moving | **idle** |
| 6000 | landed | idle | moving | **moving** (6000→7000) |
| 7000 | landed | idle | landed | landed |

Two concrete gaps read as "you can see both phases":

1. **`3000–4000`**: pitch has fully landed and phase-1 zoom is decelerating into its tail — nothing new is starting. Phase 2 doesn't begin until `MODEL_LOAD_PHASE2_START_MS = 4000`, so there's a ~1000ms window where motion is visibly settling with nothing picking up the baton.
2. **`5000–6000`**: phase-1 zoom (`cubeSizePercent`) lands at `t=5000` (`MODEL_LOAD_PHASE1_TOTAL_MS + MODEL_LOAD_INTRO_PHASE_GAP_MS` = 3000+2000). Phase-2 zoom (`cameraTargetZoomCurrent`) doesn't start moving until `MODEL_LOAD_PHASE2_START_MS + MODEL_LOAD_PHASE2_ZOOM_DELAY_MS` = 4000+2000 = 6000. Since these two zoom mechanisms multiply together into the final render scale (`const s = CUBE_SCALE * cubeSizeScale * cameraTargetZoomCurrent;` in `renderCubeFrame`, `main.js:4725`), the combined on-screen scale is **completely frozen for a full second** between them. This is the most objectively visible seam — a hard stop-then-restart in zoom specifically.

## Target

Change exactly one constant:

```js
// main.js:2761 — target
const MODEL_LOAD_PHASE_OVERLAP_MS = 2000; // was 1000
```

Nothing else in the file changes. This constant flows into `MODEL_LOAD_PHASE2_START_MS`'s existing formula (`main.js:2784`, unchanged) and `MODEL_LOAD_TOTAL_INTRO_MS`/`MODEL_LOAD_YAW_DURATION_MS`'s existing formulas (`main.js:2788-2796`, unchanged) — all three recompute automatically:

| Constant | Old value | New value |
|---|---|---|
| `MODEL_LOAD_PHASE2_START_MS` | 4000 | **3000** |
| `MODEL_LOAD_TOTAL_INTRO_MS` | 7000 | **6000** |
| `MODEL_LOAD_YAW_DURATION_MS` | 8000 | **7000** |

New absolute timeline (only phase 2's start moves; phase-1 zoom's own `0→5000` timeline, phase-2's pan `3000ms`/zoom `2000ms delay + 1000ms` internal relative timings, and the yaw curve are all untouched):

| Time (ms) | Pitch | Phase-1 zoom | Phase-2 pan | Phase-2 zoom |
|---|---|---|---|---|
| 0 | idle | moving | idle | idle |
| 1000 | moving | moving | idle | idle |
| **3000** | **landed** | moving | **moving starts here** (3000→6000) | idle |
| 5000 | landed | **landed** | moving | **moving starts here** (delay 2000 relative to new 3000 start = 5000→6000) |
| 6000 | landed | idle | landed | landed |

Both gaps close as a direct consequence:
- The `3000–4000` near-still window disappears because phase 2's pan now starts moving at the exact instant pitch lands (`t=3000`), not 1000ms later.
- The `5000–6000` zoom freeze disappears because phase-2 zoom's delay (`MODEL_LOAD_PHASE2_ZOOM_DELAY_MS = 2000`, untouched) is relative to the new, earlier phase-2 start (`3000`), so it now starts moving at `3000+2000=5000` — the exact millisecond phase-1 zoom lands. Combined on-screen scale motion is now continuous from `t=0` to `t=6000` with no freeze.
- Both curves involved at each handoff (`EASE_OUT_QUAD`'s tail and `EASE_IN_OUT_QUAD`'s head at the zoom handoff; `EASE_IN_OUT_EXPO`'s tail and `EASE_IN_OUT_QUAD`'s head at the pitch→pan handoff) already taper to/from zero velocity at their own ends — so the handoffs aren't just gap-free, they're zero-velocity-matched too (no snap).

This also means the deliberate "beat of stillness" the `MODEL_LOAD_INTRO_PHASE_GAP_MS` comment at `main.js:2748-2752` describes is being explicitly overridden by an equal-and-opposite overlap, i.e. fully cancelled out for phase-2's *start time* (net residual pause = `2000 - 2000` = 0), while phase-1's zoom still independently keeps running until `t=5000` exactly as that gap was originally built to make it do. Keep `MODEL_LOAD_INTRO_PHASE_GAP_MS` itself at `2000` — do not touch it; it's still doing real work (see "Boundaries").

## Repo conventions to follow

This file already threads every intro timing through named `MODEL_LOAD_*`
millisecond constants with derived (not hand-computed) downstream constants
— e.g. `MODEL_LOAD_PHASE2_START_MS` and `MODEL_LOAD_TOTAL_INTRO_MS` are
formulas over the base constants, not magic numbers, specifically so a
single knob change propagates everywhere it needs to (see the comment at
`main.js:2781-2784`: *"named so introCameraTargetTimer's delay and
MODEL_LOAD_TOTAL_INTRO_MS below don't have to repeat the same formula"*).
This plan's fix follows that exact pattern: change the one base constant,
let the two derived constants recompute on their own. Do not hand-edit
`MODEL_LOAD_PHASE2_START_MS`, `MODEL_LOAD_TOTAL_INTRO_MS`, or
`MODEL_LOAD_YAW_DURATION_MS` directly — they must stay formulas.

## Steps

1. Open `main.js`, find the line (currently `main.js:2761`):
   ```js
   const MODEL_LOAD_PHASE_OVERLAP_MS = 1000;
   ```
   Change `1000` to `2000`:
   ```js
   const MODEL_LOAD_PHASE_OVERLAP_MS = 2000;
   ```

2. Update the comment immediately above it (currently `main.js:2754-2760`):
   ```js
   // How much earlier than the gap would otherwise put it phase 2 actually
   // starts (see introCameraTargetTimer below) — phase 1's own zoom is still
   // timed to finish at the full MODEL_LOAD_PHASE1_TOTAL_MS +
   // MODEL_LOAD_INTRO_PHASE_GAP_MS mark either way, so pulling phase 2's start
   // forward by this amount doesn't shorten the pause itself, it just lets the
   // last stretch of phase 1's zoom-out keep playing concurrently with phase
   // 2's opening beat instead of the two being strictly back-to-back.
   ```
   Replace with:
   ```js
   // How much earlier than the gap would otherwise put it phase 2 actually
   // starts (see introCameraTargetTimer below) — phase 1's own zoom is still
   // timed to finish at the full MODEL_LOAD_PHASE1_TOTAL_MS +
   // MODEL_LOAD_INTRO_PHASE_GAP_MS mark either way. Set equal to the gap
   // itself so it fully cancels the gap's effect on phase 2's *start time* —
   // phase 2 begins the instant phase 1's rotation lands, with zero residual
   // pause, while phase 1's own zoom keeps running independently until its
   // own MODEL_LOAD_PHASE1_TOTAL_MS + MODEL_LOAD_INTRO_PHASE_GAP_MS mark.
   // This also happens to close phase 2's own zoom start-delay gap: with
   // MODEL_LOAD_PHASE2_ZOOM_DELAY_MS unchanged, phase-2 zoom now starts
   // moving at the exact millisecond phase-1 zoom lands (see the timeline in
   // plans/001-close-intro-phase-seam.md).
   ```

3. Do not edit any other constant, comment, or call site. `MODEL_LOAD_PHASE2_START_MS`, `MODEL_LOAD_TOTAL_INTRO_MS`, and `MODEL_LOAD_YAW_DURATION_MS` recompute automatically from their existing formulas — verify their new values match the "Target" table above (3000 / 6000 / 7000) by reading, not by editing them.

## Boundaries

- Do NOT change `MODEL_LOAD_INTRO_PHASE_GAP_MS` (`main.js:2752`) — it still independently controls when phase-1's zoom lands (`t=5000`), which this plan relies on for the zoom-gap fix to land exactly right. Changing it shifts phase-1 zoom's own landing time and would need `MODEL_LOAD_PHASE2_ZOOM_DELAY_MS` re-derived to match — out of scope for this single-constant fix.
- Do NOT change `MODEL_LOAD_PHASE2_ZOOM_DELAY_MS`, `MODEL_LOAD_PHASE2_ZOOM_MS`, or `MODEL_LOAD_PHASE2_PAN_MS` — they're already correctly relative to `MODEL_LOAD_PHASE2_START_MS` and don't need to change for this fix.
- Do NOT touch any easing curve (`EASE_IN_OUT_EXPO`, `EASE_OUT_QUAD`, `EASE_IN_OUT_QUAD`, `EASE_IN_OUT_SINE`) or any duration other than `MODEL_LOAD_PHASE_OVERLAP_MS` itself.
- Do NOT touch `renderCubeFrame`, `tweenCubeRotationTo`, `startIntroCameraTargetTween`, `startIntroYawTween`, or any other function body — this is a pure constant-value change.
- If `main.js:2761` (or the surrounding constants) has drifted from the excerpt above since commit `4283cdc`, STOP and report instead of guessing which constant is now the overlap.

## Verification

- **Mechanical**: `node --check main.js` — must exit 0 with no output.
- **Feel check**: run `pnpm dev`, load the app fresh (hard refresh so the intro replays), and watch the load intro:
  - Confirm there is no visible moment where the model appears to fully stop moving before the camera push-in (panning toward the highlighted object) begins — pitch settling and the pan starting should read as one continuous handoff around the 3-second mark, not a stop-then-go.
  - Confirm the zoom (the model's on-screen size) never visibly freezes mid-intro — it should look like one continuous pull-back-then-push-in, not "zoom out, pause, zoom in."
  - Confirm the overall intro still ends with the camera correctly framed on Camera Target 1's default scene (`'1-For_Home'`) — this fix only changes *when* phase 2 starts and the derived total-duration constants, not any target/goal math.
  - In DevTools, throttle CPU (Performance panel, 4x-6x slowdown) or use screen recording + frame-by-frame scrubbing to confirm the `~3000ms` and `~5000ms` marks specifically no longer show a stall.
- **Done when**: reloading the page shows the camera settle into its resting pose and immediately continue moving (panning/zooming toward Camera Target 1) with no perceptible full-stop pause anywhere before the intro finishes, and `node --check main.js` passes.
