import { POSITIONS } from "./nodePositions";

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
export const AMBIENT_COUNT = 80;
export const TRAVELING_PER_LINE = 4;

// Speed ranges
export const AMBIENT_SPEED_MIN = 0.1;
export const AMBIENT_SPEED_MAX = 0.3;
export const TRAVELING_SPEED_MIN = 0.12;
export const TRAVELING_SPEED_MAX = 0.24;

export function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Spawn a single ambient particle at a random point along a radial path from (cx, cy).
// Initialising at a random distance (not just at the origin) avoids a synchronised burst
// on first load — particles immediately look like they're mid-flight outward.
export function spawnAmbientParticle(cx: number, cy: number): AmbientParticle {
  const angle = Math.random() * Math.PI * 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy); // distance from centre to corner
  const dist = rand(0, maxDist);
  const speed = rand(AMBIENT_SPEED_MIN, AMBIENT_SPEED_MAX);
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: rand(1, 2),
    opacity: rand(0.15, 0.4),
  };
}

export function createAmbientParticles(cx: number, cy: number): AmbientParticle[] {
  return Array.from({ length: AMBIENT_COUNT }, () => spawnAmbientParticle(cx, cy));
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
