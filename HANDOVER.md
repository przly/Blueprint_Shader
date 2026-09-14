# Bluprint canvas — integration guide

Two separate embeds live in this repo, built independently — pick whichever
one you're integrating:

- **Part A: hero canvas** — a button-triggered 3D scene (`dist-canvas/`, built
  from `canvas.html` via `pnpm build:canvas`). You build your own title/cards
  UI and trigger camera moves from it via `window.heroScene`.
- **Part B: scroll canvas** — a scroll-driven 3D scene with a pre-built
  bottom-left info card (`dist/scroll-embed.html` + `dist/assets/`, built from
  `scroll-embed.html` via the ordinary `pnpm build`). No buttons to wire up —
  scrolling through the section is the entire interaction, and the card ships
  as part of the bundle.

They're unrelated bundles (different entry points, different build configs)
— don't mix pieces from one into the other.

## Part A: hero canvas (button-triggered)

This folder is a self-contained build of the 3D hero canvas. `canvas.html` is a
working reference only (open it to see the expected behavior) — you won't
embed it directly. `favicon.png` and `hero/eyebrow-dot.svg` are unused
leftovers, safe to ignore/delete.

### 1. Load the script

```html
<canvas id="canvas"></canvas>
<script type="module" src="/assets/canvas-XXXXXXXX.js"></script>
```

(`canvas-XXXXXXXX.js` — use the actual filename inside `assets/`, it's
content-hashed.)

Host `assets/canvas-*.js` yourself (path can be anything). The `<canvas
id="canvas">` element is required — the script looks it up by that id.

### 2. Size and position the canvas

The canvas has no layout opinion beyond filling its own box — put it wherever
your hero section needs it (e.g. `position: absolute; inset: 0;` inside a
`position: relative` container), same as any background layer. Your title/
cards UI layers on top as normal.

### 3. Host the 3D model

Copy the `models/` folder as-is so it's served at
`/models/sg_connect_scroll_explainer.obj` and
`/models/sg_connect_scroll_explainer.mtl` **relative to your site root** —
that exact path is hardcoded in the script. If your hosting can't serve from
root, tell us and we'll make the path configurable before you integrate.

### 4. (If your UI overlaps the canvas) exclude it from touch-drag

On mobile, touching the canvas tilts the model. If your title/cards sit on
top of the canvas, point this at their wrapper so users can still
touch-scroll over them:

```html
<canvas id="canvas" data-hero-content-selector="#your-hero-overlay"></canvas>
```

Skip this only if nothing of yours visually overlaps the canvas.

### 5. Wire your buttons to the camera

Once the script has run, `window.heroScene` is available:

```js
window.heroScene.goToTarget(0)      // jump to camera target 0, 1, or 2
window.heroScene.goToDefault()      // return to the default view
window.heroScene.getActiveTarget()  // currently active index, or null
window.heroScene.onTargetChange(cb) // cb(index) on every change; returns an unsubscribe fn
```

There are exactly 3 targets (0–2), matching the 3 scenes baked into the
model. That's the entire camera API — everything else (tilt, parallax) is
automatic.

## Part B: scroll canvas (scroll-driven, card included)

`scroll-embed.html` is the working reference — open it (or `pnpm build` then
serve `dist/scroll-embed.html`) to see the expected behavior, including the
two dark placeholder sections proving it works embedded mid-page with your
own content above and below. Read that file's own top HTML comment too; this
section summarizes the same contract.

### 1. Copy the DOM structure

```html
<div id="scroll-track">
  <div id="scroll-stage">
    <canvas id="canvas" data-scroll="true" data-preview="true"></canvas>
    <div id="perf-monitor"><div id="perf-monitor-text"></div><canvas id="perf-history" width="140" height="32"></canvas></div>
    <canvas id="axis-gizmo" width="84" height="84"></canvas>
    <div id="react-controls-root"></div>
  </div>
</div>
<script type="module" src="/assets/main-XXXXXXXX.js"></script>
<link rel="stylesheet" href="/assets/main-XXXXXXXX.css">
```

Copy this nesting (and the CSS in `scroll-embed.html`'s `<head>` for
`#scroll-track`/`#scroll-stage`/`#perf-monitor`/`#axis-gizmo`) as-is — it's
load-bearing, not just a reference layout:

- `#scroll-track` gets its height set automatically by the script (based on
  how many Camera Targets the model has) — the value in the CSS is only a
  placeholder for the instant before that runs.
- `#scroll-stage` being `position: sticky` is what pins the canvas while you
  scroll through this section and releases it back into normal flow once you
  scroll past — no JS show/hide needed. Its `transform` isn't decorative:
  per spec it makes this element a containing block for `position: fixed`
  descendants, which is what scopes the bottom-left info card (and every
  other fixed-positioned overlay in that same bundle) to this section instead
  of the whole page.
- `#perf-monitor`/`#axis-gizmo` must stay in the DOM (hidden via CSS) even
  though you'll never see them — the script looks them up unconditionally and
  isn't null-safe around them.

Put your own page content in normal document flow before and after this
block, same as `scroll-embed.html`'s own two placeholder sections.

### 2. Load the script and stylesheet

This bundle is **not** tree-shaken like Part A's — it ships the full
React/Tailwind bundle because the info card is pre-built rather than
something you build yourselves. Load both the JS bundle and its CSS bundle
(`dist/assets/main-*.js` / `main-*.css`, content-hashed — use the actual
filenames, or keep the `<script>`/`<link>` tags Vite already generated in
`dist/scroll-embed.html` if you're copying that markup directly).

Unlike Part A's script, **this one isn't freely relocatable**: `main-*.css`
loads its webfonts (Inter, Geist Mono) via root-absolute `/assets/...` URLs
baked in at build time. Copy the entire `dist/assets/` folder as-is and serve
it at `/assets/` from your site root — not just the two hashed `main-*`
files. If your hosting can't serve `/assets/` from root, tell us and we'll
adjust the build's asset base path before you integrate.

### 3. Host the 3D model

Same as Part A — copy `models/` as-is so
`/models/sg_connect_scroll_explainer.obj`/`.mtl` resolve from your site root.

### 4. That's it — no API to wire up

Camera Target assignments and the info card's copy/icons are already baked
in (the model's own "Target_N" naming drives the camera; the card's content
is bundled). Scrolling through the section is the entire interaction — there's
no `window.heroScene`-style trigger API for this build, and no touch-drag
gesture either (only scroll and passive hover-parallax).
