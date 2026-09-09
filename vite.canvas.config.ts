import path from "path"
import { defineConfig } from "vite"

// Production build for the FE team's handover — same __HERO__ tree-shaken
// bundle as vite.hero.config.ts (parallax tilt + the window.heroScene
// camera-target API, none of the presenter-tool-only code), but built from
// canvas.html instead of hero.html: no demo title/eyebrow/cards markup,
// since the FE team's homepage already has its own hero UI built. See
// canvas.html's own comments for the integration contract.
//
// Run with: pnpm exec vite build --config vite.canvas.config.ts
export default defineConfig({
  define: {
    __HERO__: "true",
  },
  build: {
    outDir: "dist-canvas",
    rollupOptions: {
      input: path.resolve(__dirname, "canvas.html"),
    },
  },
})
