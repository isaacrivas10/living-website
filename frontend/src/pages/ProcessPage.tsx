import { type CSSProperties, useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";

interface Props {
  onBack: () => void;
}

const sectionStyle: CSSProperties = { marginBottom: 52 };
const h2Style: CSSProperties = {
  fontSize: 19,
  fontWeight: 600,
  color: "var(--color-accent)",
  margin: "0 0 14px",
};
const pStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  lineHeight: 1.75,
  margin: "0 0 14px",
};
const liStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  lineHeight: 1.75,
  marginBottom: 8,
};
const codeStyle: CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  borderRadius: 4,
  padding: "1px 6px",
  fontSize: "0.9em",
  color: "var(--color-text)",
};
const preStyle: CSSProperties = {
  padding: "16px 20px",
  margin: "0 0 14px",
  fontSize: 13,
  lineHeight: 1.65,
  color: "var(--color-text-muted)",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

export default function ProcessPage({ onBack }: Props) {
  const [config, setConfig] = useState<{
    model_name: string;
    model_temperature: number;
    model_max_tokens: number;
  } | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((h) =>
        setConfig({
          model_name: h.model_name,
          model_temperature: h.model_temperature,
          model_max_tokens: h.model_max_tokens,
        }),
      )
      .catch(() => null);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        overflowY: "auto",
        background: "var(--color-base)",
        padding: "44px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 52,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, color: "var(--color-text)" }}>
            How It's Built
          </h1>
          <button
            className="glass"
            onClick={onBack}
            style={{ color: "var(--color-text-muted)", padding: "8px 16px" }}
          >
            ← Back
          </button>
        </div>

        {/* Section: The Stack */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>The Stack</h2>
          <p style={pStyle}>
            The model is{" "}
            <strong style={{ color: "var(--color-text)" }}>Qwen3.6-35B-A3B</strong> — 35B total
            parameters, 3.6B active, served locally via oMLX on port 9000 with an
            OpenAI-compatible API. A{" "}
            <strong style={{ color: "var(--color-text)" }}>FastAPI</strong> backend (Python +
            uvicorn) assembles prompts and streams responses as Server-Sent Events. A{" "}
            <strong style={{ color: "var(--color-text)" }}>React + Vite</strong> frontend renders
            the deterministic shell and surfaces AI-generated content in sandboxed iframes.
          </p>
          <p style={pStyle}>
            The low active-parameter count (3.6B of 35B) makes fresh generations cheap enough to
            run an aggressive repair loop — if the first attempt breaks, the model gets another
            try with the error context included.
          </p>
          {config && (
            <div
              className="glass"
              style={{
                padding: "14px 20px",
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                columnGap: 24,
                rowGap: 8,
                alignItems: "center",
              }}
            >
              <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Model</span>
              <code style={codeStyle}>{config.model_name}</code>
              <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Temperature</span>
              <code style={codeStyle}>{config.model_temperature}</code>
              <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Max tokens</span>
              <code style={codeStyle}>{config.model_max_tokens.toLocaleString()}</code>
            </div>
          )}
        </section>

        {/* Section: Prompt Architecture */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>Prompt Architecture</h2>
          <p style={pStyle}>
            Each generation sends a two-message conversation. The system prompt carries three
            layers, stacked in order:
          </p>
          <ol style={{ paddingLeft: 22, margin: "0 0 20px" }}>
            <li style={liStyle}>
              <strong style={{ color: "var(--color-text)" }}>Output rules</strong> — output a
              single self-contained HTML document; no markdown fences, no commentary, nothing
              external, no CDN links, no fetch calls, all data fabricated inline.
            </li>
            <li style={liStyle}>
              <strong style={{ color: "var(--color-text)" }}>Design tokens</strong> — the exact
              color palette, surface treatment, and typography that govern the shell, so AI-built
              artifacts sit inside the same visual world rather than clashing with it.
            </li>
            <li style={liStyle}>
              <strong style={{ color: "var(--color-text)" }}>Node instructions</strong> — what to
              build for this capability: diagram shape, chart types, data to fabricate, interaction
              style.
            </li>
          </ol>
          <pre className="glass" style={preStyle}>
{`SYSTEM
  [output rules]
  Output ONLY the HTML document. No markdown, no code fences, no commentary.
  Everything inline. No external requests of any kind.
  Fabricate all data. Match DESIGN TOKENS below.

  [design tokens]
  Background: #0b0f14. Surfaces: translucent glass panels.
  Primary: green #2fbf71. Highlight: yellow #f2c94c. Tertiary: teal #21a8a0.
  Text: #e6edf3 primary, #9ba7b4 muted. Rounded corners 8-12px.

  [node instructions]
  e.g. "Build a BI-style dashboard. Include 2-4 visual cards drawn with inline
  SVG, arranged in a responsive grid. Fabricate all data."

USER
  [chip text or free-text input, verbatim]`}
          </pre>
          <p style={pStyle}>
            Temperature: 0.4. Max output tokens: 16,384. Use the{" "}
            <strong style={{ color: "var(--color-text)" }}>Show prompt</strong> toggle in any
            node surface to see the exact assembled prompt for the current generation.
          </p>
        </section>

        {/* Section: Repair Loop */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>The Repair Loop</h2>
          <p style={pStyle}>
            Reliability comes from a validation-and-repair cycle, not from constraining what the
            model can produce.
          </p>
          <ol style={{ paddingLeft: 22, margin: 0 }}>
            <li style={liStyle}>
              The backend checks that the output contains recognizable HTML markup before sending
              the final{" "}
              <code style={codeStyle}>done</code> event. Half-streamed HTML is never rendered.
            </li>
            <li style={liStyle}>
              The frontend loads the completed document into a sandboxed iframe (
              <code style={codeStyle}>sandbox="allow-scripts"</code>) and listens for a{" "}
              <code style={codeStyle}>postMessage</code> health signal. A 4-second timeout catches
              silent failures.
            </li>
            <li style={liStyle}>
              On a JavaScript error or timeout, the exact error text is fed back to the model
              alongside the broken HTML. The model repairs rather than regenerating cold — it
              already has the context of what it tried and what broke.
            </li>
            <li style={liStyle}>
              After 2 failed repair attempts, the surface falls back to the node's pre-vetted
              seed. The demo never hard-fails.
            </li>
          </ol>
        </section>

        {/* Section: AI vs Deterministic */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>AI-Authored vs Deterministic</h2>
          <p style={pStyle}>
            The canvas, node layout, prompt controls, streaming build pane, and all navigation are
            fully deterministic React. Nothing you see outside a node surface is AI-generated.
          </p>
          <p style={pStyle}>
            Everything inside a node surface — the HTML structure, CSS layout, SVG diagrams,
            fabricated data, chart types, tooltips, and interactivity — is generated fresh by the
            model on each uncached request. The iframe sandbox ensures generated code cannot reach
            the parent page.
          </p>
          <p style={pStyle}>
            Curated chip prompts replay pre-warmed, pinned output instantly. Free-text inputs
            generate fresh every time, showing the engine is real and not scripted.
          </p>
        </section>

        {/* Section: Seeds and Cache */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>Seeds and the Cache</h2>
          <p style={pStyle}>
            A pre-warm script (
            <code style={codeStyle}>backend/scripts/prewarm.py</code>) runs each curated chip
            prompt against the model in parallel, validates the output, and pins it to disk. Domo
            gets two pinned seeds. Pinned entries serve dual roles: the immediate default when a
            node surface opens, and the last-resort fallback after repair failures.
          </p>
          <p style={pStyle}>
            Cache entries are keyed by{" "}
            <code style={codeStyle}>node + sha256(normalized_prompt)</code> and stored as JSON
            files under <code style={codeStyle}>data/cache/</code>. Only syntactically valid HTML
            is ever cached.
          </p>
        </section>

        {/* Footer */}
        <footer style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 40 }}>
          Built with AI, refined by humans · Argo Analytics ·{" "}
          <a
            href="https://argoanalytics.ai/schedule-a-call"
            style={{ color: "var(--color-tertiary)" }}
          >
            Build your data ecosystem
          </a>
        </footer>

      </div>
    </div>
  );
}
