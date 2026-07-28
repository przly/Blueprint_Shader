# Icon-Mosaic Shader — Project Handover

## Goal

Build a web effect that works like classic ASCII art (image/video → grid → luminance-mapped glyph per cell), but instead of text characters, each grid cell displays a **custom icon/SVG** chosen by how "dense" or "light" that region of the source image is. Reference image: `reference-icon-mosaic.png` (included alongside this doc) — bold black icons (diamonds, lightning bolts, sunbursts, snowflakes, warning triangles, scissors, gears, flowers) on a flat yellow background, forming a silhouette. Filename suggests it's a frame from an animated/video version, so the end goal is likely motion, not a static image.

## Chosen approach: Canvas 2D + pre-rendered icon bitmaps

This is the simplest path to the exact look in the reference, and handles video/animation fine without needing WebGL. Skip straight to this — no need to prototype the DOM/CSS-grid or WebGL/shader versions first. (If performance or 3D integration ever becomes a blocker, the same luminance-mapping logic ports directly to a GLSL shader with a texture atlas — see Resources below — but start simple.)

## Core algorithm

1. **Build an icon ramp.** Take the icon set and sort it by visual "weight" (how much of each icon's bounding box is filled black) — sparsest first, densest last. This is the exact same concept as an ASCII ramp like `" .:-=+*#%@"`, just with icons instead of characters.
2. **Pre-rasterize each icon once** to an offscreen canvas/bitmap at a fixed size (e.g. 64×64). Don't re-render SVG-to-canvas every frame — do it once at startup and reuse the bitmaps.
3. **Sample the source per frame.** Draw the current image or video frame to a small offscreen canvas sized to the target grid (e.g. 40 cols × 70 rows), then read pixel data via `getImageData()` to get one luminance value per cell.
4. **Map luminance → icon index:**
   ```js
   const index = Math.floor((luminance / 255) * (icons.length - 1));
   ```
5. **Render.** Loop the grid, `ctx.drawImage()` the right pre-rasterized icon bitmap at each cell position on the main canvas.

## Implementation milestones

1. **Static image first.** Get a single test image mapping to the icon grid correctly before touching video. Verify the luminance ramp looks right (dense icons in dark/detailed areas, sparse icons in light/flat areas).
2. **Icon set prep.** Decide: hand-drawn SVG set, or an existing icon library filtered down? Need at minimum 6–10 icons spanning sparse → dense visual weight.
3. **Video/animation source.** Swap the static image for a `<video>` element or webcam feed, redrawing the offscreen sample canvas every frame (`requestAnimationFrame`).
4. **Interactivity (stretch).** Mouse/scroll-driven reveal, hover-based icon swap, or scroll-scrubbed video — decide based on where this lives on the site.
5. **Performance pass.** Cap grid resolution based on device; consider `OffscreenCanvas` + worker if it needs to run alongside other page animations.

## Open decisions to make at the start of the coding session

- Static image, uploaded video, or live webcam as the source?
- Target grid density / cell size (affects icon legibility vs. resolution)
- Fixed 2-color palette (like the yellow/black reference) or does it need to support arbitrary source colors?
- Any interactivity requirement, or is it a passive background/hero animation?
- Where does the icon set come from — need it supplied as individual SVGs before coding starts

## Resources gathered during research

- **Codrops — Efecto** (real-time ASCII/dithering WebGL shader, Three.js + postprocessing): https://tympanus.net/codrops/2026/01/04/efecto-building-real-time-ascii-and-dithering-effects-with-webgl-shaders/ — useful for the luminance→index lookup pattern if this ever moves to a shader.
- **Codrops — ASCII shader with OGL**: https://tympanus.net/codrops/2024/11/13/creating-an-ascii-shader-using-ogl/ — step-by-step tutorial, good for understanding the sampling step even though it's character-based.
- **Codrops — Interactive Image Grid with Three.js**: https://tympanus.net/codrops/2025/03/18/building-an-interactive-image-grid-with-three-js/ — grid setup + luminance/grayscale function reference, closest to a DOM/WebGL hybrid grid architecture.
- **Grow Labs — ASCII Video Shader**: https://thisisgrow.com/labs/ascii-shader — explicitly built around swapping ASCII characters for a sprite sheet of custom/bespoke shapes; closest prior art to this exact idea.
- **Yanobox Mosaic** (After Effects/Premiere/FCP/Motion plugin): https://www.yanobox.com/Mosaic/ — non-code reference for the "texture atlas arranged by luminance" mechanic; good for understanding "adaptive tiling" if the grid needs to be non-uniform.
- **ASCII Magic** (browser-based image/video → ASCII/mosaic/halftone tool): https://www.ascii-magic.com/ — good for quickly testing luminance-ramp behavior on a source image before writing custom code.
- **WebGL texture atlas fundamentals**: https://webglfundamentals.org/webgl/lessons/webgl-3d-textures.html — needed only if/when this moves to WebGL.
- **threejs-kit InstancedSpriteMesh**: https://three-kit.vercel.app/instancedsprite/01-instanced-sprite-mesh/ — for a WebGL upgrade path, instancing many independently-swappable sprites efficiently.
- **three.js AsciiEffect docs**: https://threejs.org/docs/pages/AsciiEffect.html — reference implementation of the base algorithm this is derived from.

## Notes for Claude Code

- Start with a single static HTML file (Canvas 2D, no build step) to prove out the algorithm fast. Only move to a React component / build pipeline once the core effect is confirmed working.
- Keep icon rasterization and luminance sampling as separate, testable functions — makes it much easier to swap the icon set or tune the grid later.
- Confirm the open decisions above before assuming video vs. static image — it changes the render-loop structure.
