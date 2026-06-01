import React, { useEffect, useState } from "react";
import Canvas from "./components/Canvas";
import NodeSurface from "./components/NodeSurface";
import ProcessPage from "./pages/ProcessPage";
import { fetchNodes } from "./lib/api";
import type { NodeMeta } from "./types";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            height: "100vh",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 400 }}>
            <h2 style={{ color: "#ff6b6b" }}>Something went wrong</h2>
            <p style={{ color: "var(--color-text-muted)" }}>{this.state.error}</p>
            <button
              className="glass"
              onClick={() => this.setState({ hasError: false, error: "" })}
              style={{ color: "var(--color-accent)", padding: "8px 16px" }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [tooSmall] = useState(() => window.innerWidth < 1024);
  const [started, setStarted] = useState(false);
  const [nodes, setNodes] = useState<NodeMeta[]>([]);
  const [entered, setEntered] = useState<NodeMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<"canvas" | "process">("canvas");

  useEffect(() => {
    if (tooSmall) return;
    fetchNodes().then(setNodes).catch((e) => setError(String(e)));
  }, [tooSmall]);

  if (tooSmall) {
    return (
      <main style={{ display: "grid", placeItems: "center", height: "100vh", padding: "24px", textAlign: "center" }}>
        <p style={{ color: "var(--color-text-muted)", maxWidth: 360 }}>
          The Living Data Ecosystem is built for desktop. Please open it on a wider screen.
        </p>
      </main>
    );
  }

  if (page === "process") {
    return <ProcessPage onBack={() => setPage("canvas")} />;
  }

  return (
    <main style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
      {!started && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "grid", placeItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ color: "var(--color-text)", fontWeight: 600 }}>The Living Data Ecosystem</h1>
            <p style={{ color: "var(--color-text-muted)" }}>
              Explore what Argo builds — each capability generates itself, live.
            </p>
            <button
              className="glass"
              onClick={() => setStarted(true)}
              style={{ marginTop: 16, color: "var(--color-accent)", padding: "10px 22px" }}
            >
              Enter
            </button>
            {error && <p style={{ color: "#ff6b6b", marginTop: 12 }}>Backend error: {error}</p>}
          </div>
        </div>
      )}

      {started && nodes.length > 0 && (
        <ErrorBoundary>
          <Canvas nodes={nodes} onEnter={setEntered} />
        </ErrorBoundary>
      )}

      {entered && <NodeSurface node={entered} onClose={() => setEntered(null)} />}

      <footer
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: "12px 20px",
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: 13,
        }}
      >
        Built with AI, refined by humans · Argo Analytics ·{" "}
        <a href="https://argoanalytics.ai/schedule-a-call" style={{ color: "var(--color-tertiary)" }}>
          Build your data ecosystem
        </a>
        {" · "}
        <button
          onClick={() => setPage("process")}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--color-tertiary)",
            cursor: "pointer",
            font: "inherit",
            fontSize: 13,
          }}
        >
          How it's built
        </button>
      </footer>
    </main>
  );
}
