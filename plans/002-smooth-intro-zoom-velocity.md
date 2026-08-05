# 002 — Remove the zero-velocity "valley" at the intro's zoom handoff

- **Status**: REVERTED (applied, then reverted at user's request — "before it was better")
- **Commit**: 4283cdc
- **Severity**: MEDIUM
- **Category**: Easing & duration / Physicality (a genuine velocity discontinuity, not a taste call)
- **Estimated scope**: 1 file (`main.js`), 1 call site, 3 values changed

## Problem

The load intro's on-screen zoom level is the product of two *different*
variables, each driven by its own independent tween, stitched together at a
single instant:

- **Phase 1** eases `cubeSizePercent` (the "Model size" value) — via
  `tweenCubeRotationTo`'s `zoomDurationMs`/`zoomEasing` params, `main.js:2899-2903`.
- **Phase 2** eases `cameraTargetZoomCurrent` (the camera-target "frame to
  fit" multiplier) — via `startIntroCameraTargetTween`, `main.js:2922-2928`.

They multiply together into the actual render scale:

```js
// main.js:4725 — inside renderCubeFrame, unchanged by this plan
const s = CUBE_SCALE * cubeSizeScale * cameraTargetZoomCurrent;
```

Current constants (`main.js:2789-2803`):

```js
// main.js:2789-2803 — current
const MODEL_LOAD_PHASE2_PAN_MS = 5000;

// Phase 2's zoom duration and start delay — zoom holds at its starting
// scale until MODEL_LOAD_PHASE2_ZOOM_DELAY_MS after phase 2 begins, then
// eases over MODEL_LOAD_PHASE2_ZOOM_MS, landing at the same moment the pan
// does (2000 + 3000 = MODEL_LOAD_PHASE2_PAN_MS). ZOOM_DELAY_MS is left at
// 2000 rather than scaled up with everything else here — that's what makes
// it start moving at the exact millisecond phase 1's own zoom lands
// (MODEL_LOAD_PHASE2_START_MS + 2000 = MODEL_LOAD_PHASE1_TOTAL_MS +
// MODEL_LOAD_INTRO_PHASE_GAP_MS with the current constants), closing the
// seam between phase 1 and phase 2's zoom motion (see
// plans/001-close-intro-phase-seam.md) — changing this value would reopen
// that gap.
const MODEL_LOAD_PHASE2_ZOOM_MS = 3000;
const MODEL_LOAD_PHASE2_ZOOM_DELAY_MS = 2000;
```

And the call site (`main.js:2922-2928`):

```js
// main.js:2922-2928 — current
introCameraTargetTimer = setTimeout(
  () => startIntroCameraTargetTween(
    0, MODEL_LOAD_PHASE2_PAN_MS, EASE_IN_OUT_QUAD, MODEL_LOAD_PHASE2_ZOOM_MS, EASE_IN_OUT_QUAD,
    MODEL_LOAD_PHASE2_ZOOM_DELAY_MS,
  ),
  MODEL_LOAD_PHASE2_START_MS,
);
```

With `MODEL_LOAD_PHASE1_TOTAL_MS=3000`, `MODEL_LOAD_INTRO_PHASE_GAP_MS=2000`,
`MODEL_LOAD_PHASE_OVERLAP_MS=2000` (all unchanged by plan 001,
`MODEL_LOAD_PHASE2_START_MS=3000`), the absolute timeline is:

- Phase-1 zoom (`cubeSizePercent`, `EASE_OUT_QUAD`): active `t=0→5000`.
- Phase-2 zoom (`cameraTargetZoomCurrent`, `EASE_IN_OUT_QUAD`): active `t=5000→8000` (delay `2000` + duration `3000`, relative to phase-2's `t=3000` start).

Plan 001 closed the *literal* gap between these — they're now perfectly
adjacent with no dead time. But adjacency isn't the same as smooth: **both
curves have zero velocity at the exact instant they meet.**

- `EASE_OUT_QUAD(t) = 1-(1-t)²`. Its derivative is `2(1-t)`, which is `0` at
  `t=1` — phase-1's zoom decelerates all the way to a dead stop by the time
  it lands at `t=5000` (this is required: `cubeSizePercent` must be exactly
  the baked default and never move again afterward — see the surrounding
  comments).
- `EASE_IN_OUT_QUAD(t) = t<0.5 ? 2t² : 1-(-2t+2)²/2`. Its derivative on the
  first branch is `4t`, which is `0` at `t=0` — phase-2's zoom starts from a
  dead stop.

Because `s = cubeSizeScale * cameraTargetZoomCurrent` (product rule), the
combined zoom's rate of change right around `t=5000` is dominated by two
near-zero terms on both sides. The zoom doesn't freeze anymore (no literal
gap), but it visibly **decelerates to near-rest, then re-accelerates from
near-rest**, right in the middle of the motion — a soft "valley" in zoom
speed. Pan and rotation don't have this: each is driven by exactly one
continuous tween for its whole span (pan: one `EASE_IN_OUT_QUAD` across all
5000ms; pitch: one `EASE_IN_OUT_EXPO`), so neither ever dips to near-zero
mid-flight. That structural difference — zoom is stitched from two separate
mechanisms, pan/rotation aren't — is why zoom specifically reads as less
continuous than "all the other movement."

## Target

Three changes, all at the existing phase-2 zoom call site and its two
duration constants — no new mechanism, no new easing curve needed:

```js
// main.js:2802-2803 — target
const MODEL_LOAD_PHASE2_ZOOM_MS = 4000; // was 3000
const MODEL_LOAD_PHASE2_ZOOM_DELAY_MS = 1000; // was 2000
```

```js
// main.js:2922-2928 — target
introCameraTargetTimer = setTimeout(
  () => startIntroCameraTargetTween(
    0, MODEL_LOAD_PHASE2_PAN_MS, EASE_IN_OUT_QUAD, MODEL_LOAD_PHASE2_ZOOM_MS, EASE_OUT_QUAD,
    MODEL_LOAD_PHASE2_ZOOM_DELAY_MS,
  ),
  MODEL_LOAD_PHASE2_START_MS,
);
```

(Only the 4th tween-shape argument — phase-2 zoom's easing — changes, from
`EASE_IN_OUT_QUAD` to `EASE_OUT_QUAD`. Pan keeps `EASE_IN_OUT_QUAD`,
untouched.)

New timeline: phase-2 zoom now starts moving at `MODEL_LOAD_PHASE2_START_MS
+ 1000 = 4000`, i.e. **1000ms before** phase-1's zoom lands at `5000` — a
genuine overlap instead of an adjacent handoff. Duration grows from `3000`
to `4000` so it still lands at the same instant as before: `1000+4000=5000`
= `MODEL_LOAD_PHASE2_PAN_MS`, so zoom and pan still land together at
`t=3000+5000=8000` (verify: old zoom landed at `3000+2000+3000=8000` too —
unchanged).

Why this removes the valley — velocity at the new crossover point
(`t=4000`):

- Phase-1 zoom (`EASE_OUT_QUAD`) is `(4000-0)/5000 = 0.8` through its own
  `0→5000` span. Velocity `∝ 2(1-0.8) = 0.4` — still clearly decelerating,
  not yet at rest (down from full speed, but very much alive).
- Phase-2 zoom (now `EASE_OUT_QUAD`, its own `t=0`) has velocity
  `∝ 2(1-0) = 2` — its peak speed, the moment it kicks in.

Both terms are solidly nonzero and moving in the *same direction* (zooming
toward the target) at the crossover — the product's combined rate of change
never dips toward zero the way it does with the current adjacent,
both-at-rest handoff. Switching phase-2's zoom to `EASE_OUT_QUAD` also means
the whole zoom motion (phase 1 *and* phase 2) is now the same curve family
throughout — a secondary cohesion win, not just a velocity fix.

Side effect to expect and accept: `EASE_OUT_QUAD` front-loads its motion
(fast start, long decelerating tail) rather than `EASE_IN_OUT_QUAD`'s
symmetric ease-in. Phase-2's push-in zoom will feel snappier at its own
start and taper more gradually at the end, rather than gently accelerating
into it. This is the intended trade-off for continuity — call it out in the
feel-check rather than treating it as a regression.

## Repo conventions to follow

Same pattern as plan 001: change only the named `MODEL_LOAD_*` constants and
the one call site that reads them; do not hand-edit any derived constant.
`MODEL_LOAD_TOTAL_INTRO_MS` and `MODEL_LOAD_YAW_DURATION_MS` are formulas
over `Math.max(MODEL_LOAD_PHASE2_PAN_MS, MODEL_LOAD_PHASE2_ZOOM_DELAY_MS +
MODEL_LOAD_PHASE2_ZOOM_MS)` (`main.js:2812-2820`) — with the target values
above that max is still `5000` (`1000+4000`), equal to
`MODEL_LOAD_PHASE2_PAN_MS`'s `5000`, so neither derived constant's value
actually changes. Read them to confirm, don't edit them.

## Steps

1. Open `main.js`, find (currently `main.js:2789-2803`):
   ```js
   const MODEL_LOAD_PHASE2_PAN_MS = 5000;

   // Phase 2's zoom duration and start delay — zoom holds at its starting
   // scale until MODEL_LOAD_PHASE2_ZOOM_DELAY_MS after phase 2 begins, then
   // eases over MODEL_LOAD_PHASE2_ZOOM_MS, landing at the same moment the pan
   // does (2000 + 3000 = MODEL_LOAD_PHASE2_PAN_MS). ZOOM_DELAY_MS is left at
   // 2000 rather than scaled up with everything else here — that's what makes
   // it start moving at the exact millisecond phase 1's own zoom lands
   // (MODEL_LOAD_PHASE2_START_MS + 2000 = MODEL_LOAD_PHASE1_TOTAL_MS +
   // MODEL_LOAD_INTRO_PHASE_GAP_MS with the current constants), closing the
   // seam between phase 1 and phase 2's zoom motion (see
   // plans/001-close-intro-phase-seam.md) — changing this value would reopen
   // that gap.
   const MODEL_LOAD_PHASE2_ZOOM_MS = 3000;
   const MODEL_LOAD_PHASE2_ZOOM_DELAY_MS = 2000;
   ```
   Replace the comment and the two constant values with:
   ```js
   const MODEL_LOAD_PHASE2_PAN_MS = 5000;

   // Phase 2's zoom duration and start delay — zoom holds at its starting
   // scale until MODEL_LOAD_PHASE2_ZOOM_DELAY_MS after phase 2 begins, then
   // eases over MODEL_LOAD_PHASE2_ZOOM_MS, landing at the same moment the pan
   // does (1000 + 4000 = MODEL_LOAD_PHASE2_PAN_MS). ZOOM_DELAY_MS is
   // deliberately *less* than the 2000ms it would take to start exactly when
   // phase 1's own zoom lands (MODEL_LOAD_PHASE1_TOTAL_MS +
   // MODEL_LOAD_INTRO_PHASE_GAP_MS) — starting 1000ms earlier means phase-2
   // zoom is already at its own peak velocity while phase-1's zoom is still
   // in its decelerating tail, instead of both being at a dead stop at the
   // same instant (see plans/002-smooth-intro-zoom-velocity.md for the
   // velocity math). Landing time is preserved by growing ZOOM_MS to match.
   const MODEL_LOAD_PHASE2_ZOOM_MS = 4000;
   const MODEL_LOAD_PHASE2_ZOOM_DELAY_MS = 1000;
   ```

2. Find the call site (currently `main.js:2904-2928`, the `introCameraTargetTimer = setTimeout(...)` block). Update its surrounding comment and the `startIntroCameraTargetTween` call itself:
   ```js
   // main.js:2904-2921 — current comment, ends with:
   // ... framing. Pan and zoom share the same EASE_IN_OUT_QUAD curve — the
   // in-out counterpart of phase 1's own zoom curve (EASE_OUT_QUAD, see its
   // call site above) — but zoom additionally holds at its starting scale
   // for MODEL_LOAD_PHASE2_ZOOM_DELAY_MS before easing over
   // MODEL_LOAD_PHASE2_ZOOM_MS (see its own comment on why that lands it
   // exactly alongside the pan). startIntroCameraTargetTween itself is a
   // no-op if slot 0 ends up unassigned (e.g. a fresh manual model load
   // beat this timer to it), and this timer is cancelled by
   // goToCameraTarget/resetCameraTarget if the presenter picks a target
   // (or "Go to default") manually before it fires.
   introCameraTargetTimer = setTimeout(
     () => startIntroCameraTargetTween(
       0, MODEL_LOAD_PHASE2_PAN_MS, EASE_IN_OUT_QUAD, MODEL_LOAD_PHASE2_ZOOM_MS, EASE_IN_OUT_QUAD,
       MODEL_LOAD_PHASE2_ZOOM_DELAY_MS,
     ),
     MODEL_LOAD_PHASE2_START_MS,
   );
   ```
   Replace with:
   ```js
   // ... framing. Pan uses EASE_IN_OUT_QUAD; zoom uses EASE_OUT_QUAD — the
   // same curve family phase 1's own zoom uses (see its call site above) —
   // and starts MODEL_LOAD_PHASE2_ZOOM_DELAY_MS after phase 2 begins,
   // *overlapping* the tail of phase 1's zoom rather than picking up
   // exactly where it ends, so the combined on-screen zoom never dips to
   // near-zero velocity mid-motion (see its own comment, and
   // plans/002-smooth-intro-zoom-velocity.md). startIntroCameraTargetTween
   // itself is a no-op if slot 0 ends up unassigned (e.g. a fresh manual
   // model load beat this timer to it), and this timer is cancelled by
   // goToCameraTarget/resetCameraTarget if the presenter picks a target
   // (or "Go to default") manually before it fires.
   introCameraTargetTimer = setTimeout(
     () => startIntroCameraTargetTween(
       0, MODEL_LOAD_PHASE2_PAN_MS, EASE_IN_OUT_QUAD, MODEL_LOAD_PHASE2_ZOOM_MS, EASE_OUT_QUAD,
       MODEL_LOAD_PHASE2_ZOOM_DELAY_MS,
     ),
     MODEL_LOAD_PHASE2_START_MS,
   );
   ```

## Boundaries

- Do NOT change `EASE_IN_OUT_QUAD` used for **pan** in the same call — only the 4th argument (zoom's easing) changes.
- Do NOT change `MODEL_LOAD_PHASE2_PAN_MS`, `MODEL_LOAD_PHASE2_START_MS`, `MODEL_LOAD_PHASE1_TOTAL_MS`, `MODEL_LOAD_INTRO_PHASE_GAP_MS`, or `MODEL_LOAD_PHASE_OVERLAP_MS` — none of them need to change for this fix, and plan 001's gap-closing fix depends on them staying as-is.
- Do NOT hand-edit `MODEL_LOAD_TOTAL_INTRO_MS` or `MODEL_LOAD_YAW_DURATION_MS` — confirm by reading that they still evaluate to `8000`/`10000` (unchanged, per the "Repo conventions" section above), don't set them directly.
- Do NOT touch phase 1's own zoom (`tweenCubeRotationTo`'s call at `main.js:2899-2903`, its `EASE_OUT_QUAD` zoom easing, or `zoomInFactor 0.5`) — it's already correct and this plan's fix works by changing phase 2 to meet it, not the other way around.
- Do NOT touch `startIntroCameraTargetTween`'s function body, `renderCubeFrame`, or any other function — this is a pure call-site + constant-value change.
- If the cited excerpts have drifted from what's actually in `main.js` since commit `4283cdc`, STOP and report the mismatch instead of guessing which constant is which.

## Verification

- **Mechanical**: `node --check main.js` — must exit 0 with no output.
- **Feel check**: run `pnpm dev`, hard-refresh so the intro replays, and watch specifically the *zoom* (the model's on-screen size) through the whole intro, not just the pan/rotation:
  - Confirm the zoom never appears to slow to a near-stop and then pick back up partway through — it should read as one continuous, if not perfectly uniform, decelerating pull-in from start to finish, the same quality of continuity pan and rotation already have.
  - Confirm phase 2's push-in zoom itself still looks intentional and controlled, not jarringly fast at its start — `EASE_OUT_QUAD` starts faster than the previous `EASE_IN_OUT_QUAD` did; if it reads as *too* abrupt at the `t=4000` handoff, that's a legitimate follow-up tuning call (e.g. reduce the overlap or try `EASE_OUT_CUBIC`'s stronger tail instead), not a sign this plan's diagnosis was wrong.
  - Confirm the camera still lands correctly framed on Camera Target 1's default scene (`'1-For_Home'`) at the end — this plan only changes zoom's easing curve and internal timing, not any target/goal math.
  - In DevTools, throttle CPU (Performance panel, 4x–6x) or screen-record + scrub frame-by-frame around the `t≈4000–5000ms` mark specifically (from page load) to confirm there's no visible hitch in zoom speed there.
- **Done when**: the intro's zoom reads as one continuous pull-in-then-push-in motion with no perceptible mid-flight hesitation, and `node --check main.js` passes.
