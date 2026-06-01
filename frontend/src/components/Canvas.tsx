import { useRef, useState } from "react";
import type { NodeMeta } from "../types";
import { POSITIONS } from "./nodePositions";
import { useParticleRenderer } from "./useParticleRenderer";

interface Props {
  nodes: NodeMeta[];
  onEnter: (node: NodeMeta) => void;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export default function Canvas({ nodes, onEnter }: Props) {
  const [t, setT] = useState<Transform>(() => ({
    x: (window.innerWidth - 960) / 2,
    y: (window.innerHeight - 720) / 2,
    scale: 1,
  }));
  const [focusing, setFocusing] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef(t);
  transformRef.current = t;

  useParticleRenderer(outerRef, canvasRef, transformRef);

  const onWheel = (e: React.WheelEvent) => {
    const next = Math.min(2.5, Math.max(0.5, t.scale - e.deltaY * 0.001));
    setT((prev) => ({ ...prev, scale: next }));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX - t.x, y: e.clientY - t.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setT((prev) => ({ ...prev, x: e.clientX - dragRef.current!.x, y: e.clientY - dragRef.current!.y }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const onLostPointerCapture = () => {
    dragRef.current = null;
  };

  const enter = (node: NodeMeta, pos: { x: number; y: number }) => {
    // Zoom the canvas toward the node, then open its surface.
    setFocusing(true);
    const scale = 2.2;
    setT({
      x: window.innerWidth / 2 - pos.x * scale,
      y: window.innerHeight / 2 - pos.y * scale,
      scale,
    });
    window.setTimeout(() => {
      setFocusing(false);
      onEnter(node);
    }, 550);
  };

  return (
    <div
      ref={outerRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onLostPointerCapture={onLostPointerCapture}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        cursor: dragRef.current ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }}
      />
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 960,
          height: 720,
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
          transformOrigin: "0 0",
          transition: focusing ? "transform 0.5s ease-in-out" : "none",
          zIndex: 1,
        }}
      >
        {nodes.map((node, i) => {
          const pos = POSITIONS[i] ?? POSITIONS[0];
          return (
            <button
              key={node.id}
              className="glass node-float node-gem"
              onClick={() => enter(node, pos)}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: 220,
                padding: "20px 24px 28px",
                textAlign: "left",
                color: "var(--color-text)",
                animationDelay: `${i * 0.8}s`,
              }}
            >
              <div style={{ color: "var(--color-accent)", fontSize: 18, fontWeight: 600 }}>
                {node.title}
              </div>
              <div style={{ color: "var(--color-text-muted)", marginTop: 8, fontSize: 13 }}>
                {node.blurb}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
