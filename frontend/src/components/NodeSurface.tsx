import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSeed, fetchSeeds, streamGenerate, streamRepair } from "../lib/api";
import type { NodeMeta } from "../types";

const MAX_REPAIR_ATTEMPTS = 2;
const RENDER_TIMEOUT_MS = 4000;

// Injected at the start of <head> so it precedes LLM CSS (which overrides it) but
// still registers the error listener before any body scripts run.
// The html background fallback fixes LLM-generated docs that set body{background:transparent}
// without setting an html background — the iframe viewport would otherwise default to white.
const HEALTH_SCRIPT = `
<style>html{background:#0b0f14}</style>
<script>
(function () {
  window.addEventListener("error", function (e) {
    parent.postMessage({ __lde: "error", message: (e && e.message) || "render error" }, "*");
  });
  window.addEventListener("load", function () {
    parent.postMessage({ __lde: "ok" }, "*");
  });
})();
</script>`;

function injectHealthScript(html: string): string {
  // Target the opening <head> tag so our CSS comes first and LLM styles override it.
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const insertAt = headMatch.index + headMatch[0].length;
    return html.slice(0, insertAt) + HEALTH_SCRIPT + html.slice(insertAt);
  }
  return HEALTH_SCRIPT + html;
}

type Status = "loading" | "generating" | "repairing" | "rendered" | "seed";

interface Props {
  node: NodeMeta;
  onClose: () => void;
}

export default function NodeSurface({ node, onClose }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [note, setNote] = useState<string>("");
  const [buildingText, setBuildingText] = useState<string>("");
  const [doc, setDoc] = useState<string>("");
  const [sentPrompt, setSentPrompt] = useState<string>("");
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [freeText, setFreeText] = useState<string>("");
  const [lastMeta, setLastMeta] = useState<{ ms: number; tokensUsed: number | null } | null>(null);
  const [seeds, setSeeds] = useState<string[]>([]);
  const [seedIndex, setSeedIndex] = useState(0);

  const attemptsRef = useRef(0);
  const promptRef = useRef("");
  const htmlRef = useRef("");
  const awaitingRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearRenderTimeout = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const render = useCallback((html: string) => {
    htmlRef.current = html;
    awaitingRef.current = true;
    setDoc(injectHealthScript(html));
    clearRenderTimeout();
    timeoutRef.current = window.setTimeout(() => {
      if (awaitingRef.current) handleFailure("render timed out");
    }, RENDER_TIMEOUT_MS);
  }, []);

  const loadSeed = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    awaitingRef.current = false;
    clearRenderTimeout();
    const seed = await fetchSeed(node.id);
    if (seed) {
      setDoc(injectHealthScript(seed));
      setStatus("seed");
      setNote("Showing a saved example.");
    } else {
      setDoc("");
      setStatus("seed");
      setNote("No saved example available yet. Try a prompt above.");
    }
  }, [node.id]);

  const handleFailure = useCallback(
    (message: string) => {
      awaitingRef.current = false;
      clearRenderTimeout();
      if (attemptsRef.current >= MAX_REPAIR_ATTEMPTS) {
        loadSeed();
        return;
      }
      attemptsRef.current += 1;
      setStatus("repairing");
      setNote(`Render failed — repairing (attempt ${attemptsRef.current}).`);
      setBuildingText("");
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      streamRepair(node.id, promptRef.current, htmlRef.current, message, {
        onChunk: (t) => setBuildingText((prev) => prev + t),
        onDone: (html, _cached, ms, tokensUsed) => {
          setLastMeta({ ms, tokensUsed });
          render(html);
        },
        onError: () => loadSeed(),
      }, signal);
    },
    [loadSeed, node.id, render],
  );

  const generate = useCallback(
    (prompt: string) => {
      attemptsRef.current = 0;
      promptRef.current = prompt;
      setSentPrompt(prompt);
      setBuildingText("");
      setNote("");
      setStatus("generating");
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      streamGenerate(node.id, prompt, {
        onChunk: (t) => setBuildingText((prev) => prev + t),
        onDone: (html, _cached, ms, tokensUsed) => {
          setLastMeta({ ms, tokensUsed });
          render(html);
        },
        onError: () => loadSeed(),
      }, signal);
    },
    [loadSeed, node.id, render],
  );

  // Listen for the iframe health-check.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.__lde === undefined) return;
      if (!awaitingRef.current) return;
      if (data.__lde === "ok") {
        awaitingRef.current = false;
        clearRenderTimeout();
        setStatus((s) => (s === "seed" ? s : "rendered"));
        setNote("");
      } else if (data.__lde === "error") {
        handleFailure(String(data.message || "render error"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleFailure]);

  // Load all seeds on mount; show first pinned seed immediately.
  useEffect(() => {
    let cancelled = false;
    fetchSeeds(node.id).then((allSeeds) => {
      if (cancelled) return;
      setSeeds(allSeeds);
      setSeedIndex(0);
      if (allSeeds.length > 0) {
        awaitingRef.current = false;
        setDoc(injectHealthScript(allSeeds[0]));
        setStatus("rendered");
      } else {
        setStatus("rendered");
        setNote("No seed yet — type a prompt or pick a chip to generate.");
      }
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      clearRenderTimeout();
    };
  }, [node.id]);

  const busy = status === "generating" || status === "repairing";
  const showSeedTabs =
    seeds.length > 1 && !busy && (status === "rendered" || status === "seed") && sentPrompt === "";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        padding: "24px",
        gap: "16px",
        background: "rgba(11, 15, 20, 0.92)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
        <h2 style={{ margin: 0, color: "var(--color-accent)" }}>{node.title}</h2>
        <span style={{ color: "var(--color-text-muted)" }}>{node.blurb}</span>
        <button
          onClick={onClose}
          className="glass"
          style={{ marginLeft: "auto", color: "var(--color-text)", padding: "8px 14px" }}
        >
          Back to map
        </button>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {node.chips.map((chip) => (
          <button
            key={chip.label}
            disabled={busy}
            onClick={() => generate(chip.prompt)}
            className="glass"
            style={{ color: "var(--color-text)", padding: "8px 14px" }}
          >
            {chip.label}
          </button>
        ))}
        <input
          value={freeText}
          disabled={busy}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && freeText.trim()) generate(freeText.trim());
          }}
          placeholder="Describe what to build…"
          className="glass"
          style={{
            flex: 1,
            minWidth: "220px",
            color: "var(--color-text)",
            padding: "9px 14px",
            outline: "none",
          }}
        />
        <button
          disabled={busy || !freeText.trim()}
          onClick={() => generate(freeText.trim())}
          className="glass"
          style={{ color: "var(--color-highlight)", padding: "8px 14px" }}
        >
          Generate
        </button>
        <button
          onClick={() => setShowPrompt((v) => !v)}
          className="glass"
          style={{ color: "var(--color-text-muted)", padding: "8px 14px" }}
        >
          {showPrompt ? "Hide prompt" : "Show prompt"}
        </button>
      </div>

      {showSeedTabs && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Examples:</span>
          {seeds.map((_, i) => (
            <button
              key={i}
              className="glass"
              onClick={() => {
                setSeedIndex(i);
                setDoc(injectHealthScript(seeds[i]));
              }}
              style={{
                color: i === seedIndex ? "var(--color-accent)" : "var(--color-text-muted)",
                padding: "5px 12px",
                fontSize: 13,
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {note && <div style={{ color: "var(--color-highlight)" }}>{note}</div>}

      {showPrompt && sentPrompt && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <pre
            className="glass"
            style={{
              margin: 0,
              padding: "12px",
              color: "var(--color-text-muted)",
              whiteSpace: "pre-wrap",
              maxHeight: "120px",
              overflow: "auto",
            }}
          >
            {sentPrompt}
          </pre>
          {lastMeta && (
            <div style={{ display: "flex", gap: 20, color: "var(--color-text-muted)", fontSize: 12, paddingLeft: 4 }}>
              <span>{lastMeta.ms.toLocaleString()} ms</span>
              {lastMeta.tokensUsed != null && (
                <span>{lastMeta.tokensUsed.toLocaleString()} tokens</span>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", gap: "16px", minHeight: 0 }}>
        <iframe
          title={`${node.title} artifact`}
          sandbox="allow-scripts"
          srcDoc={doc}
          className="glass"
          style={{ flex: busy ? 2 : 1, width: "100%", height: "100%", border: "none" }}
        />
        {busy && (
          <pre
            className="glass"
            style={{
              flex: 1,
              margin: 0,
              padding: "12px",
              color: "var(--color-text-muted)",
              whiteSpace: "pre-wrap",
              overflow: "auto",
              fontSize: "12px",
            }}
          >
            {buildingText || "Generating…"}
          </pre>
        )}
      </div>
    </div>
  );
}
