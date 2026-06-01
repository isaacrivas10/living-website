# Particle Background + Connection Lines

## Overview

Add an animated particle field and glowing connection lines behind the node cards on the Canvas view. The effect creates a "living ecosystem" feel — nodes are connected by flowing data, and the background has atmospheric depth.

## Architecture

The `<canvas>` element is placed **inside** the transformed node container `<div>` (the one with `transform: translate(...) scale(...)`). This ensures the canvas inherits the same CSS transform — particles stay locked to nodes during pan/zoom without needing a separate transform calculation. The canvas has `position: absolute; inset: 0; z-index: -1; pointer-events: none;` so it sits behind the node buttons within the same stacking context.

The canvas is rendered via `requestAnimationFrame` with no per-frame allocations. Particle positions, velocities, and travel progress are stored in `useRef` to avoid re-renders.

## Components

### ParticleRenderer (inline in Canvas.tsx)

A `useEffect` hook that:
1. Gets the canvas 2D context
2. Sets canvas dimensions to match the container's client rect
3. Initializes ambient particles and traveling particles
4. Starts a `requestAnimationFrame` loop
5. Returns a cleanup function that calls `cancelAnimationFrame` to prevent leaks on unmount and React 18 strict-mode double-mount

### Ambient Particles

- **Count:** 100 dots
- **Size:** 1-2px radius
- **Opacity:** 0.15-0.4 (randomized per particle)
- **Speed:** 0.1-0.3 px/frame in random direction
- **Behavior:** Wrap to opposite edge in **world coordinates** (not viewport pixels). E.g., `if (p.x > worldWidth) p.x = 0` where `worldWidth` is the container's CSS width. This prevents particles from "jumping" at different rates when zoomed.
- **Color:** White (`rgba(255,255,255,...)`) with per-particle lightness variation of ±5%
- **Interaction:** None — purely atmospheric

### Connection Lines

- **Count:** 3 lines forming a triangle between the 3 nodes
- **Style:** 1px solid, opacity 0.12
- **Color:** `--color-accent` (#2fbf71) with linear gradient: brightest at center, fading to 0 opacity at both endpoints
- **Drawing:** `globalCompositeOperation = 'lighter'` for subtle glow where lines overlap in the triangle interior

### Traveling Particles

- **Count:** 4 per line (12 total)
- **Size:** 2-3px radius core + 6-8px glow halo
- **Speed:** 0.12-0.24 progress/second (time-based via `performance.now()` delta, not frame-based). This keeps travel time consistent (~4-8 seconds per loop) regardless of framerate.
- **Behavior:** Loop continuously from one endpoint to the other, staggered start positions
- **Color:** `--color-accent` (#2fbf71), core at 0.7 opacity, halo at 0.2 opacity
- **Drawing:** Two circles per particle — larger halo first, smaller core on top

## Data Flow

```
Node positions (POSITIONS array)
    ↓
Canvas placed inside transformed container (inherits CSS transform automatically)
    ↓
Each frame:
  1. Clear canvas
  2. Draw connection lines (node positions in world coords)
  3. Update + draw ambient particles (world coords, wrap at worldWidth/worldHeight)
  4. Update + draw traveling particles (interpolate along lines, time-based progress)
```

The canvas inherits the container's `transform: translate(...) scale(...)` via CSS — no manual transform computation needed.

## Resize Handling

A `ResizeObserver` on the canvas's parent container updates `canvas.width` and `canvas.height` to match the client rect. Particle positions are NOT rescaled — they are already in world coordinates and get scaled by the inherited CSS transform.

## Performance Constraints

- No `new` allocations inside the animation loop
- Particle arrays are allocated once in `useEffect`
- Canvas `width`/`height` only updated on resize, not per frame
- Target: 60fps on modern laptops, 30fps acceptable on slower hardware
- Particle count is a constant (100 ambient + 12 traveling = 112 draw calls per frame)

## Out of Scope

- Particle interaction (no mouse repulsion, no click effects)
- Dynamic line creation/deletion (lines are fixed per node count)
- Configurable particle count (hardcoded constants)
- WebGL (Canvas2D is sufficient for this particle count)

## Implementation Notes

- Canvas gets `aria-hidden="true"` since it is purely decorative
- Canvas has `pointer-events: none` so it does not intercept clicks or drags
- Animation loop checks `document.hidden` to pause when tab is backgrounded (saves battery)
- `ResizeObserver` on the parent container (not `window.resize`) for robustness against layout changes
