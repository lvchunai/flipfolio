# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```bash
npm run build    # Rollup build → dist/ (ESM, UMD, minified variants + CSS)
npm run dev      # Watch mode with auto-rebuild
```

Build produces 5 files in `dist/`: `flipfolio.esm.js`, `flipfolio.esm.min.js`, `flipfolio.umd.js`, `flipfolio.umd.min.js`, `flipfolio.css`.

The demo at `examples/index.html` uses the UMD build (`dist/flipfolio.umd.js`) via `<script>` tag — not ES modules — to avoid CORS errors when opened via `file://` protocol.

No test framework is configured. Verify changes by building and opening `examples/index.html` in a browser.

## Architecture

**Single-class component** (`FlipFolio`) in `src/index.js`, zero dependencies, exported as default. CSS in `src/flipfolio.css` (auto-injected at runtime unless `autoInjectCSS: false`).

### 2-Pages-Per-Leaf Model

Each leaf = one sheet of paper with content on both sides. Front face = right-hand page (recto, `pages[i*2]`), back face = left-hand page (verso, `pages[i*2+1]`). `_leafCount = Math.ceil(pages.length / 2)`. `currentPage` returns `_currentLeaf` (spread index). When flipped, the back face becomes visible on the left side, creating a natural two-page spread.

### DOM Hierarchy

```
.ff-book → .ff-pages (perspective container)
  ├── .ff-leaf × N (positioned at left:50%, rotates around spine via transform-origin:left)
  │   ├── .ff-face-front (.ff-content + .ff-shadow + .ff-curl)
  │   └── .ff-face-back (.ff-content + .ff-shadow + .ff-curl)
  ├── .ff-cast-shadow-left/right
  └── .ff-spine-shadow
```

### Flip Mechanics

- CSS `rotateY(0deg)` → unflipped (right side), `rotateY(-180deg)` → flipped (left side)
- CSS transition drives the rotation; RAF loop (`_animateCurl`) syncs curl gradient effects using a Newton-Raphson cubic bezier solver matching the CSS timing function
- `_flipLeaf(index, forward, fromAngle)` accepts optional `fromAngle` for smooth drag-to-flip continuity
- Drag: pointer events map mouse deltaX to rotation angle, threshold determines flip-or-snap-back
- Edge hover curl: detects mouse within `edgeCurlZone` px of left/right edge, peeks the next/prev leaf
- `_cornerUnpeek(instant)` forces reflow when instant to properly clear inline transition before subsequent flips
- Leaf child DOM references cached in `leaf._ff` object to avoid querySelector in animation hot path

### Curl Effect (WowBook-inspired)

`_buildCurlGradient()` generates 25+ stop linear-gradient simulating cylindrical paper fold. Applied to `.ff-curl` overlay elements. Complemented by inset box-shadows (paper edge thickness), drop-shadow filter (3D depth), and cast shadows on underlying pages.

## Conventions

- All CSS classes prefixed `ff-`, CSS variables prefixed `--ff-`
- Private JS methods/properties prefixed with `_`
- Event handlers bound in constructor, stored as `_onXxx` properties
- Custom event system: `on()`/`off()`/`_emit()` with `_listeners` map
- Click-to-flip is disabled by default (`clickToFlip: false`)
