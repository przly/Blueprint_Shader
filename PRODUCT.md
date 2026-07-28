# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal NGEN stakeholders (e.g. sales, leadership) who present this 3D blueprint-model viewer during pitches or demos. This is not a public-website surface — there is no confirmed general-public or self-serve visitor audience for it.

## Product Purpose

NGEN is an energy / infrastructure company (name suggests "next-gen" power or generation). This surface is an interactive 3D viewer used as a pitch/demo visual: it renders NGEN's own model in an engineering-blueprint style, with a wireframe "blueprint mode" and animated flow arrows illustrating a process or system flow across the model.

## Positioning

Not yet confirmed. Only the category ("energy / infrastructure," "next-gen power or generation") is established — the specific mechanism, product, or claim that differentiates NGEN is an open decision. Do not invent specifics.

## Operating Context

Presented live during internal demos or pitches, not the public website. The presenter can:
- load a custom 3D model (drag/drop or file input, `.obj`/`.mtl`), defaulting to NGEN's own model at `3Dmodel/ngen.obj`
- toggle wireframe "blueprint mode"
- draw and show/hide an animated "flow" arrow across the model, with adjustable pulse width, to narrate a process or system flow
- resize the model (10%–1000%, with 0.5x/2x quick buttons)
- hide/show the controls panel (☰ button or H key); panel state and slider values persist across reloads via `localStorage`

## Capabilities and Constraints

- The 3D/WebGL rendering (`main.js`) is plain JS, Canvas 2D/WebGL, no framework — this part stays framework-free.
- The control panel (top-left) is React + Tailwind v4 + coss ui (Base UI primitives), introduced via Vite. `main.js` exposes a small bridge object (`export const controls = {...}`, bottom of the file) that `src/panel.tsx` calls into and subscribes to; `main.js` itself has no DOM dependency on the panel's markup.
- Build tooling: `pnpm install`, `pnpm dev` (dev server, port 8001), `pnpm build`/`pnpm typecheck`. `pnpm build` currently drops the `/main.js` script tag from the bundled `dist/index.html` (Vite only recognized `/src/main.tsx` as an entry) — the WebGL scene would not load in a production build until this is fixed (e.g. via `build.rollupOptions.input` multi-entry config, or moving `main.js`'s logic into the module graph). Only `pnpm dev` has been verified end-to-end so far.
- Other HTML files in this folder (`card.html`, `card-scramble.html`, `scroll-gradient.html`) and `files/icon-mosaic-handover.md` are separate, unrelated prototypes/experiments — not part of this surface's confirmed scope, and not migrated to the new build tooling.

## Brand Commitments

Company name: NGEN. No confirmed logo, voice, or color system beyond the current implementation (black canvas background, white/translucent UI chrome). The user has explicitly asked that the design stay **as clean as possible** — a binding constraint for future visual work on this surface; avoid adding ornamentation.

## Evidence on Hand

- `3Dmodel/ngen.obj` + `3Dmodel/ngen.mtl` — NGEN's actual 3D model asset, the primary content this surface renders.
- `icons/1.svg`–`15.svg` — a numbered icon set (from the separate icon-mosaic experiment; not confirmed as part of this surface).
- No testimonials, case studies, press, pricing, or deployment claims exist. Do not fabricate any.

## Product Principles

1. This is a pitch/demo tool, not the public site — optimize for clarity and impact in a presented setting, not for broad public accessibility or discovery.
2. Keep the design as clean as possible — no decorative additions beyond what the blueprint/model/flow-arrow motifs require.
3. The 3D model and the blueprint/flow-arrow motifs are the core communication device; future work should keep them central rather than replacing them with generic marketing patterns.
4. NGEN's real model (`ngen.obj`) is the primary asset; any placeholder cube/pyramid geometry is a dev aid, not the shipped experience.
5. Only "energy / infrastructure, next-gen power or generation" is confirmed about NGEN's business — do not invent specific offerings, customers, or claims beyond that.
