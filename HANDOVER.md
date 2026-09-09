# Bluprint canvas — integration guide

This folder is a self-contained build of the 3D hero canvas. `canvas.html` is a
working reference only (open it to see the expected behavior) — you won't
embed it directly. `favicon.png` and `hero/eyebrow-dot.svg` are unused
leftovers, safe to ignore/delete.

## 1. Load the script

```html
<canvas id="canvas"></canvas>
<script type="module" src="/assets/canvas-XXXXXXXX.js"></script>
```

(`canvas-XXXXXXXX.js` — use the actual filename inside `assets/`, it's
content-hashed.)

Host `assets/canvas-*.js` yourself (path can be anything). The `<canvas
id="canvas">` element is required — the script looks it up by that id.

## 2. Size and position the canvas

The canvas has no layout opinion beyond filling its own box — put it wherever
your hero section needs it (e.g. `position: absolute; inset: 0;` inside a
`position: relative` container), same as any background layer. Your title/
cards UI layers on top as normal.

## 3. Host the 3D model

Copy the `models/` folder as-is so it's served at `/models/ngen_assets.obj`
and `/models/ngen_assets.mtl` **relative to your site root** — that exact
path is hardcoded in the script. If your hosting can't serve from root, tell
us and we'll make the path configurable before you integrate.

## 4. (If your UI overlaps the canvas) exclude it from touch-drag

On mobile, touching the canvas tilts the model. If your title/cards sit on
top of the canvas, point this at their wrapper so users can still
touch-scroll over them:

```html
<canvas id="canvas" data-hero-content-selector="#your-hero-overlay"></canvas>
```

Skip this only if nothing of yours visually overlaps the canvas.

## 5. Wire your buttons to the camera

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
