import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { AmbientParticle, ConnectionLine, TravelingParticle } from "./particles";
import {
  createAmbientParticles,
  createConnectionLines,
  createTravelingParticles,
  spawnAmbientParticle,
} from "./particles";

interface WorldTransform {
  x: number;
  y: number;
  scale: number;
}

export function useParticleRenderer(
  containerRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  transformRef: RefObject<WorldTransform>,
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

    // Initialize particle data — ambient particles need the canvas centre, so we
    // size the canvas first and then create them.
    const container = containerRef.current!;
    const resize = () => {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      // Reinitialise ambient particles centred on the new canvas size.
      if (particlesRef.current) {
        particlesRef.current.ambient = createAmbientParticles(canvas.width / 2, canvas.height / 2);
      }
    };
    resize();

    const lines = createConnectionLines();
    const ambient = createAmbientParticles(canvas.width / 2, canvas.height / 2);
    const traveling = createTravelingParticles(lines);
    particlesRef.current = { ambient, lines, traveling };

    const observer = new ResizeObserver(resize);
    observer.observe(container);

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
      const tr = transformRef.current;

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connection lines (projected through world transform)
      ctx.globalCompositeOperation = "lighter";
      for (const line of ln) {
        drawConnectionLine(ctx, line, tr);
      }

      // Update and draw ambient particles in screen space.
      // Particles move radially outward; when they leave the canvas they reset to
      // a new random outward path from the centre so the flow is continuous.
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < amb.length; i++) {
        const p = amb[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          amb[i] = spawnAmbientParticle(cx, cy);
        } else {
          drawAmbientParticle(ctx, p);
        }
      }

      // Update and draw traveling particles (projected through world transform)
      for (const p of trav) {
        p.progress += p.speed * delta;
        if (p.progress > 1) p.progress -= 1;
        drawTravelingParticle(ctx, p, ln[p.lineIndex], tr);
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

function drawConnectionLine(ctx: CanvasRenderingContext2D, line: ConnectionLine, tr: WorldTransform) {
  const x1 = tr.x + line.fromX * tr.scale;
  const y1 = tr.y + line.fromY * tr.scale;
  const x2 = tr.x + line.toX * tr.scale;
  const y2 = tr.y + line.toY * tr.scale;

  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  gradient.addColorStop(0, "rgba(47, 191, 113, 0)");
  gradient.addColorStop(0.5, "rgba(47, 191, 113, 0.18)");
  gradient.addColorStop(1, "rgba(47, 191, 113, 0)");

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
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
  tr: WorldTransform,
) {
  const wx = line.fromX + (line.toX - line.fromX) * p.progress;
  const wy = line.fromY + (line.toY - line.fromY) * p.progress;
  const x = tr.x + wx * tr.scale;
  const y = tr.y + wy * tr.scale;

  // Halo
  ctx.fillStyle = "rgba(47, 191, 113, 0.35)";
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();

  // Core
  ctx.fillStyle = "rgba(47, 191, 113, 0.7)";
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}
