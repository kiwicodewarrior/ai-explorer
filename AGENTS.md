<INSTRUCTIONS>
This repo targets a beginner-friendly 2D web game stack:

- Runtime: Browser (HTML5 Canvas/WebGL via Phaser)
- Language: TypeScript
- Game framework: Phaser 3
- Tooling: Vite (dev server + build)

## Defaults
- Prefer Phaser-first solutions (Scenes, Arcade Physics, Animations, Cameras, Input).
- Keep code simple and readable over clever patterns.
- Avoid over-engineering (no ECS unless explicitly requested).

## Project shape (recommended)
- `index.html` boots the app
- `src/main.ts` creates the Phaser `Game`
- `src/scenes/*` contains Phaser scenes (e.g. `BootScene`, `MenuScene`, `GameScene`)
- `src/systems/*` optional small helpers (input, audio, UI)
- `src/assets/*` for images/audio/atlases (or `public/assets/*` if needed by Vite)

## Commands (expected)
- Dev: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Style
- Use TypeScript `strict` where possible.
- Prefer named exports and small modules.
- Keep Phaser objects lifecycle-safe: create in `create()`, cleanup in `shutdown/destroy` handlers.
- For gameplay constants, prefer a single `src/config.ts` over scattered magic numbers.
</INSTRUCTIONS>
