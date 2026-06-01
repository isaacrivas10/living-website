# Particle Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an animated particle field and glowing connection lines behind the node cards on the Canvas view.

**Architecture:** A single `<canvas>` element is placed inside the transformed node container in `Canvas.tsx`. It inherits the CSS `translate/scale` transform automatically. A `useEffect` hook runs a `requestAnimationFrame` loop that draws ambient particles, connection lines, and traveling particles — all in world coordinates with no per-frame allocations.

**Tech Stack:** React, TypeScript, Canvas2D API, no new dependencies.

---

### Task 1: Add canvas element and extract node positions

**Files:**
- Modify: `frontend/src/components/Canvas.tsx`

- [ ] **Step 1: Extract POSITIONS to its own file**

Create `frontend/src/components/nodePositions.ts`:

```tsx
// Fixed positions for up to three nodes, in world coordinates (px).
export const POSITIONS = [
  { x: 260, y: 300 },
  { x: 680, y: 200 },
  { x: 560, y: 540 },
] as const;
```

Then modify `frontend/src/components/Canvas.tsx`:
- Remove the `POSITIONS` constant definition (lines 10-14)
- Add import: `import { POSITIONS } from "./nodePositions";`

- [ ] **Step 2: Add canvas element inside the transformed container**

In `Canvas.tsx`, add a ref for the canvas:
```tsx
const canvasRef = useRef<HTMLCanvasElement>(null);
```

Add a ref for the transformed container:
```tsx
const containerRef = useRef<HTMLDivElement>(null);
```

Inside the transformed `<div>` (the one with `transform: translate(...) scale(...)` on line 77-85), add a `<canvas>` element as the first child, before the `{nodes.map(...)}`:

```tsx
<canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" }} />
```

Also apply `ref={containerRef}` to the transformed `<div>` itself (the one with the transform style).

- [ ] **Step 3: Verify the build still passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors. The canvas is invisible but present in the DOM.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/nodePositions.ts frontend/src/components/Canvas.tsx
git commit -m "feat: extract node positions and add canvas element to transformed container"
```

---

### Task 2: Implement particle data structures

**Files:**
- Create: `frontend/src/components/particles.ts`

- [ ] **Step 1: Create particle types and initialization**

Create a new file `frontend/src/components/particles.ts` with the following types and constants:

```tsx
// Ambient particle: small drifting dot
export interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
}

// Traveling particle: glowing dot moving along a line
export interface TravelingParticle {
  progress: number; // 0..1 along the line
  speed: number;    // progress per second
  lineIndex: number;
}

// Connection line: from one node position to another
export interface ConnectionLine {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

// World dimensions for wrapping ambient particles
export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 720;

// Particle counts
export const AMBIENT_COUNT = 100;
export const TRAVELING_PER_LINE = 4;

// Speed ranges
export const AMBIENT_SPEED_MIN = 0.1;
export const AMBIENT_SPEED_MAX = 0.3;
export const TRAVELING_SPEED_MIN = 0.12;
export const TRAVELING_SPEED_MAX = 0.24;
```

- [ ] **Step 2: Create initialization functions**

Add two initialization functions to the same file:

```tsx
import { POSITIONS } from "./nodePositions";

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function createAmbientParticles(): AmbientParticle[] {
  const particles: AmbientParticle[] = new Array(AMBIENT_COUNT);
  for (let i = 0; i < AMBIENT_COUNT; i++) {
    particles[i] = {
      x: rand(0, WORLD_WIDTH),
      y: rand(0, WORLD_HEIGHT),
      vx: rand(AMBIENT_SPEED_MIN, AMBIENT_SPEED_MAX) * (Math.random() > 0.5 ? 1 : -1),
      vy: rand(AMBIENT_SPEED_MIN, AMBIENT_SPEED_MAX) * (Math.random() > 0.5 ? 1 : -1),
      radius: rand(1, 2),
      opacity: rand(0.15, 0.4),
    };
  }
  return particles;
}

export function createConnectionLines(): ConnectionLine[] {
  // 3 lines forming a triangle between the 3 nodes
  const n = POSITIONS.length;
  const lines: ConnectionLine[] = [];
  for (let i = 0; i < n; i++) {
    lines.push({
      fromX: POSITIONS[i].x,
      fromY: POSITIONS[i].y,
      toX: POSITIONS[(i + 1) % n].x,
      toY: POSITIONS[(i + 1) % n].y,
    });
  }
  return lines;
}

export function createTravelingParticles(lines: ConnectionLine[]): TravelingParticle[] {
  const particles: TravelingParticle[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < TRAVELING_PER_LINE; j++) {
      particles.push({
        progress: j / TRAVELING_PER_LINE, // staggered start positions
        speed: rand(TRAVELING_SPEED_MIN, TRAVELING_SPEED_MAX),
        lineIndex: i,
      });
    }
  }
  return particles;
}
```

- [ ] **Step 3: Verify the build still passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds. TypeScript compiles the new file.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/particles.ts
git commit -m "feat: add particle data structures and initialization"
```

---

### Task 3: Implement the particle renderer hook

**Files:**
- Create: `frontend/src/components/useParticleRenderer.ts`

- [ ] **Step 1: Create the particle renderer hook**

Create `frontend/src/components/useParticleRenderer.ts`:

```tsx
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  AmbientParticle,
  ConnectionLine,
  TravelingParticle,
  createAmbientParticles,
  createConnectionLines,
  createTravelingParticles,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "./particles";

export function useParticleRenderer(
  containerRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
) {
  const particlesRef = useRef<{
    ambient: AmbientParticle[];
    lines: ConnectionLine[];
    traveling: TravelingParticle[];
  } | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Initialize particle data
    const lines = createConnectionLines();
    const ambient = createAmbientParticles();
    const traveling = createTravelingParticles(lines);
    particlesRef.current = { ambient, lines, traveling };

    // Resize handler
    const resize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current!);

    // Animation loop
    const animate = (time: number) => {
      // Pause when tab is hidden
      if (document.hidden) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const delta = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      lastTimeRef.current = time;

      const { ambient: amb, lines: ln, traveling: trav } = particlesRef.current!;

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connection lines
      ctx.globalCompositeOperation = "lighter";
      for (const line of ln) {
        drawConnectionLine(ctx, line);
      }

      // Update and draw ambient particles
      ctx.globalCompositeOperation = "source-over";
      for (const p of amb) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x > WORLD_WIDTH) p.x = 0;
        if (p.x < 0) p.x = WORLD_WIDTH;
        if (p.y > WORLD_HEIGHT) p.y = 0;
        if (p.y < 0) p.y = WORLD_HEIGHT;
        drawAmbientParticle(ctx, p);
      }

      // Update and draw traveling particles
      for (const p of trav) {
        p.progress += p.speed * delta;
        if (p.progress > 1) p.progress -= 1;
        drawTravelingParticle(ctx, p, ln[p.lineIndex]);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [containerRef, canvasRef]);
}

function drawConnectionLine(ctx: CanvasRenderingContext2D, line: ConnectionLine) {
  const gradient = ctx.createLinearGradient(line.fromX, line.fromY, line.toX, line.toY);
  gradient.addColorStop(0, "rgba(47, 191, 113, 0)");
  gradient.addColorStop(0.5, "rgba(47, 191, 113, 0.12)");
  gradient.addColorStop(1, "rgba(47, 191, 113, 0)");

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(line.fromX, line.fromY);
  ctx.lineTo(line.toX, line.toY);
  ctx.stroke();
}

function drawAmbientParticle(ctx: CanvasRenderingContext2D, p: AmbientParticle) {
  ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawTravelingParticle(
  ctx: CanvasRenderingContext2D,
  p: TravelingParticle,
  line: ConnectionLine,
) {
  const x = line.fromX + (line.toX - line.fromX) * p.progress;
  const y = line.fromY + (line.toY - line.fromY) * p.progress;

  // Halo
  ctx.fillStyle = "rgba(47, 191, 113, 0.2)";
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();

  // Core
  ctx.fillStyle = "rgba(47, 191, 113, 0.7)";
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}
```

- [ ] **Step 2: Wire the hook into Canvas.tsx**

In `Canvas.tsx`:
1. Import `useParticleRenderer` from `./useParticleRenderer`
2. Call `useParticleRenderer(containerRef, canvasRef)` at the top of the component, after the existing `useState` and `useRef` declarations but before the event handler functions

- [ ] **Step 3: Verify the build still passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/useParticleRenderer.ts frontend/src/components/Canvas.tsx
git commit -m "feat: add particle renderer hook with animation loop"
```

---

### Task 4: Visual verification and tuning

**Files:**
- `frontend/src/components/useParticleRenderer.ts`
- `frontend/src/components/particles.ts`

- [ ] **Step 1: Start the frontend dev server and verify visually**

Run: `cd frontend && npm run dev`
Open http://localhost:5173 in a browser.

Verify:
- Canvas is behind the node cards (not blocking clicks)
- 100 ambient particles drift slowly in random directions
- 3 connection lines form a triangle between nodes (faint green)
- 12 traveling particles move along the lines (brighter green with glow)
- Particles stay locked to nodes during pan/zoom
- No jank at 60fps

- [ ] **Step 2: Tune particle parameters if needed**

If particles are too dense, reduce `AMBIENT_COUNT` from 100 to 70.
If lines are too faint, increase opacity from 0.12 to 0.18.
If traveling particles are too fast/slow, adjust `TRAVELING_SPEED_MIN/MAX`.

- [ ] **Step 3: Commit any tuning changes**

```bash
git add frontend/src/components/particles.ts frontend/src/components/useParticleRenderer.ts
git commit -m "chore: tune particle parameters for visual quality"
```
