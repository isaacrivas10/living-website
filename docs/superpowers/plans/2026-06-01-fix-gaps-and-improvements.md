# Fix Gaps & Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all spec gaps and code-quality issues identified in the 2026-06-01 review: surface LLM parameters via config, add cache helpers, add the `/process` page, fix HEALTH_SCRIPT injection, add request cancellation, expose Domo's two seeds in the UI, and give canvas nodes geometric shapes.

**Architecture:** Backend fixes are isolated to `config.py`, `cache.py`, and `main.py`. All frontend changes land in `api.ts`, `NodeSurface.tsx`, `Canvas.tsx`, and a new `ProcessPage.tsx`. Tasks are ordered so each backend task can be tested independently before frontend work begins.

**Tech Stack:** Python 3.11, FastAPI, pytest, React 19, TypeScript 6, Vite 8, Tailwind CSS 4

---

## File Map

| Status | File | Change |
|---|---|---|
| Modify | `backend/app/config.py` | Add `model_temperature` and `model_max_tokens` fields |
| Modify | `backend/app/llm_client.py` | Read inference params from `settings` |
| Modify | `backend/.env.example` | Document new env vars |
| Modify | `backend/app/cache.py` | Add `get_seeds()` and `unpin()` |
| Modify | `backend/app/main.py` | Add `GET /api/seeds/{node}` route |
| Create | `backend/scripts/unpin.py` | CLI to list and unpin cached seeds |
| Modify | `backend/tests/test_stream_chat.py` | Test that settings params are forwarded |
| Modify | `backend/tests/test_cache.py` | Tests for `get_seeds` and `unpin` |
| Modify | `backend/tests/test_routes.py` | Tests for `/api/seeds/{node}` |
| Modify | `frontend/src/lib/api.ts` | Add `fetchSeeds`, add `AbortSignal` to stream calls |
| Modify | `frontend/src/components/NodeSurface.tsx` | Multi-seed UI, HEALTH_SCRIPT injection fix, AbortController |
| Modify | `frontend/src/components/Canvas.tsx` | Geometric node shapes via clip-path |
| Modify | `frontend/src/index.css` | `.node-gem` CSS class |
| Create | `frontend/src/pages/ProcessPage.tsx` | Static /process content page |
| Modify | `frontend/src/App.tsx` | Page state + ProcessPage rendering + footer link |
| Modify | `backend/app/generation.py` | Capture token usage; add `tokens_used` to `done` SSE event |
| Modify | `backend/app/llm_client.py` | Add optional `usage_out` param to `stream_chat` (Task 9) |
| Modify | `backend/app/main.py` | Add `model_temperature` + `model_max_tokens` to `/api/health` (Task 9) |
| Modify | `frontend/src/types.ts` | Extend `HealthResponse`; add `tokensUsed` to `StreamHandlers.onDone` |
| Modify | `frontend/src/lib/api.ts` | Forward `tokens_used` through `onDone` (Task 9) |
| Modify | `frontend/src/components/NodeSurface.tsx` | Track last-gen stats; show in Show-prompt panel (Task 9) |
| Modify | `frontend/src/pages/ProcessPage.tsx` | Add live config callout fetched from `/api/health` (Task 9) |

---

## Task 1: Surface LLM Inference Parameters via Settings

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/llm_client.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/test_stream_chat.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_stream_chat.py`:

```python
from unittest.mock import MagicMock

def test_stream_chat_forwards_settings_params(monkeypatch):
    from app import config
    monkeypatch.setattr(config.settings, "model_temperature", 0.9)
    monkeypatch.setattr(config.settings, "model_max_tokens", 512)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = iter([])  # no deltas — just checking kwargs

    list(stream_chat(fake_client, [{"role": "user", "content": "x"}]))

    kwargs = fake_client.chat.completions.create.call_args.kwargs
    assert kwargs["temperature"] == 0.9
    assert kwargs["max_tokens"] == 512
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend && .venv/bin/pytest tests/test_stream_chat.py::test_stream_chat_forwards_settings_params -v
```

Expected: `FAILED` — `AssertionError: assert 0.4 == 0.9`

- [ ] **Step 3: Add fields to `config.py`**

Replace the body of `Settings` in `backend/app/config.py` so it reads:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    model_base_url: str = "http://localhost:9000/v1"
    model_api_key: str = "local"
    model_name: str = "Qwen3.6-35B-A3B"
    request_timeout_seconds: float = 120.0
    frontend_origin: str = "http://localhost:5173"

    model_temperature: float = 0.4
    model_max_tokens: int = 16384


settings = Settings()
```

- [ ] **Step 4: Update `stream_chat` in `llm_client.py`**

Replace the two hardcoded values in the `create` call:

```python
stream = client.chat.completions.create(  # pyright: ignore[reportArgumentType, reportCallIssue]
    model=settings.model_name,
    messages=messages,
    stream=True,
    temperature=settings.model_temperature,
    max_tokens=settings.model_max_tokens,
)
```

- [ ] **Step 5: Update `.env.example`**

Add to `backend/.env.example`:

```
MODEL_TEMPERATURE=0.4
MODEL_MAX_TOKENS=16384
```

- [ ] **Step 6: Run all tests to confirm they pass**

```bash
cd backend && .venv/bin/pytest -v
```

Expected: all tests pass.

---

## Task 2: Add `get_seeds` and `unpin` to Cache Module

**Files:**
- Modify: `backend/app/cache.py`
- Test: `backend/tests/test_cache.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_cache.py`:

```python
def test_get_seeds_returns_all_pinned(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p1", "<html>first</html>", ms=100, pinned=True)
    cache.save("domo", "p2", "<html>second</html>", ms=200, pinned=True)
    cache.save("domo", "p3", "<html>unpinned</html>", ms=150)
    seeds = cache.get_seeds("domo")
    assert len(seeds) == 2
    assert all("<html>" in s for s in seeds)


def test_get_seeds_empty_when_none_pinned(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p", "<html>x</html>", ms=1)
    assert cache.get_seeds("domo") == []


def test_unpin_clears_pinned_flag(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p", "<html>x</html>", ms=1, pinned=True)
    assert cache.load("domo", "p")["pinned"] is True
    result = cache.unpin("domo", "p")
    assert result is True
    assert cache.load("domo", "p")["pinned"] is False


def test_unpin_returns_false_when_entry_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    assert cache.unpin("domo", "does-not-exist") is False
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend && .venv/bin/pytest tests/test_cache.py -k "get_seeds or unpin" -v
```

Expected: `ERROR` — `AttributeError: module 'app.cache' has no attribute 'get_seeds'`

- [ ] **Step 3: Implement `get_seeds` and `unpin` in `cache.py`**

Append both functions after `get_seed` in `backend/app/cache.py`:

```python
def get_seeds(node: str) -> list[str]:
    if not CACHE_DIR.exists():
        return []
    seeds: list[str] = []
    for file in sorted(CACHE_DIR.glob("*.json"))[:200]:
        data = json.loads(file.read_text())  # type: ignore[return-value]
        if data["node"] == node and data.get("pinned"):
            seeds.append(data["html"])
    return seeds


def unpin(node: str, prompt: str) -> bool:
    path = _path(node, prompt)
    if not path.exists():
        return False
    data = json.loads(path.read_text())
    data["pinned"] = False
    path.write_text(json.dumps(data))
    return True
```

- [ ] **Step 4: Run cache tests to confirm they pass**

```bash
cd backend && .venv/bin/pytest tests/test_cache.py -v
```

Expected: all cache tests pass.

---

## Task 3: Add `/api/seeds/{node}` Backend Route

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_routes.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_routes.py`:

```python
def test_seeds_unknown_node_returns_404():
    assert client.get("/api/seeds/marketing").status_code == 404


def test_seeds_returns_all_pinned_for_node(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p1", "<html>first</html>", ms=100, pinned=True)
    cache.save("domo", "p2", "<html>second</html>", ms=200, pinned=True)
    response = client.get("/api/seeds/domo")
    assert response.status_code == 200
    body = response.json()
    assert body["node"] == "domo"
    assert len(body["seeds"]) == 2


def test_seeds_returns_empty_list_when_none_pinned(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    response = client.get("/api/seeds/domo")
    assert response.status_code == 200
    assert response.json()["seeds"] == []
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend && .venv/bin/pytest tests/test_routes.py -k "seeds" -v
```

Expected: `FAILED` — 404 on the `/api/seeds/domo` calls since the route doesn't exist yet.

- [ ] **Step 3: Add the route to `main.py`**

Add after the existing `get_seed` route in `backend/app/main.py`:

```python
@app.get("/api/seeds/{node}")
def get_seeds_route(node: str) -> dict[str, object]:
    if node not in NODES:
        raise HTTPException(status_code=404, detail="unknown node")
    return {"node": node, "seeds": cache.get_seeds(node)}
```

Also add `get_seeds` to the cache import at the top of `main.py`. The full import line becomes:

```python
from app import cache
```

(No change needed — `cache.get_seeds` is accessed as an attribute. Verify `cache` is already imported; it is.)

- [ ] **Step 4: Run all backend tests to confirm pass**

```bash
cd backend && .venv/bin/pytest -v
```

Expected: all tests pass.

---

## Task 4: Add `unpin.py` Script

**Files:**
- Create: `backend/scripts/unpin.py`

No automated test — this is an operator script. Manual verification via listing.

- [ ] **Step 1: Create `backend/scripts/unpin.py`**

```python
"""List or unpin pinned cache entries (seeds).

Usage:
    cd backend && .venv/bin/python scripts/unpin.py
        Lists all pinned entries.

    cd backend && .venv/bin/python scripts/unpin.py <node> "<prompt>"
        Unpins the entry matching node + exact prompt text.

Example:
    .venv/bin/python scripts/unpin.py domo "Show monthly revenue by region with anomaly detection highlighting unusual months."
"""

from __future__ import annotations

import json
import sys

from app import cache


def list_pinned() -> None:
    if not cache.CACHE_DIR.exists():
        print("No cache directory found.")
        return
    pinned: list[tuple[str, str, str]] = []
    for file in sorted(cache.CACHE_DIR.glob("*.json")):
        data = json.loads(file.read_text())
        if data.get("pinned"):
            pinned.append((data["node"], data["prompt"], file.name))
    if not pinned:
        print("No pinned entries.")
        return
    header = f"{'Node':<20}  {'Prompt (first 70 chars)':<72}  File"
    print(header)
    print("-" * len(header))
    for node, prompt, fname in pinned:
        print(f"{node:<20}  {prompt[:70]:<72}  {fname}")


def main() -> None:
    if len(sys.argv) == 1:
        list_pinned()
        return
    if len(sys.argv) != 3:
        print(__doc__)
        raise SystemExit(1)
    _, node, prompt = sys.argv
    if cache.unpin(node, prompt):
        print(f"Unpinned: [{node}] {prompt[:70]}")
    else:
        print(f"Not found (check spelling): [{node}] {prompt[:70]}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test the script**

```bash
cd backend && .venv/bin/python scripts/unpin.py
```

Expected: prints "No cache directory found." or a table of pinned entries (depending on whether `data/cache/` has content).

---

## Task 5: Add `fetchSeeds` and `AbortSignal` Support to `api.ts`

**Files:**
- Modify: `frontend/src/lib/api.ts`

No frontend test suite exists. Verify correctness by running the app and checking network requests in devtools after the NodeSurface changes in Task 6.

- [ ] **Step 1: Replace `frontend/src/lib/api.ts` with the updated version**

The changes are: (a) add optional `signal` parameter to `streamPost`, (b) propagate `signal` to `fetch` and the `reader.read()` loop, (c) silently swallow `AbortError` so callers don't see noise, (d) add `signal` to exported `streamGenerate` and `streamRepair`, (e) add `fetchSeeds`.

```typescript
import type { HealthResponse, NodeMeta, StreamHandlers } from "../types";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
  return response.json();
}

export async function fetchNodes(): Promise<NodeMeta[]> {
  const response = await fetch("/api/nodes");
  if (!response.ok) throw new Error(`Failed to load nodes: ${response.status}`);
  return response.json();
}

export async function fetchSeed(node: string): Promise<string | null> {
  const response = await fetch(`/api/seed/${node}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data.html ?? null;
}

export async function fetchSeeds(node: string): Promise<string[]> {
  const response = await fetch(`/api/seeds/${node}`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.seeds ?? [];
}

async function streamPost(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    handlers.onError?.(String(e));
    return;
  }
  if (!response.ok || !response.body) {
    handlers.onError?.(`Request failed: ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    let value: Uint8Array | undefined;
    let done: boolean;
    try {
      ({ value, done } = await reader.read());
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    }
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      if (!raw.startsWith("data:")) continue;
      let evt: any;
      try {
        evt = JSON.parse(raw.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "meta") handlers.onMeta?.(evt.cached);
      else if (evt.type === "chunk") handlers.onChunk?.(evt.text);
      else if (evt.type === "done") handlers.onDone?.(evt.html, evt.cached, evt.ms);
      else if (evt.type === "error") handlers.onError?.(evt.message);
    }
  }
}

export function streamGenerate(
  node: string,
  prompt: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return streamPost("/api/generate", { node, prompt }, handlers, signal);
}

export function streamRepair(
  node: string,
  prompt: string,
  previousHtml: string,
  error: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return streamPost(
    "/api/repair",
    { node, prompt, previous_html: previousHtml, error },
    handlers,
    signal,
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

---

## Task 6: Update NodeSurface — Multi-Seed UI, HEALTH_SCRIPT Fix, AbortController

**Files:**
- Modify: `frontend/src/components/NodeSurface.tsx`

This task rewrites the component in-place. Changes are: (a) replace `fetchSeed` with `fetchSeeds` in mount, (b) add seed-selector tabs, (c) add `injectHealthScript` helper and replace all `html + HEALTH_SCRIPT` uses, (d) add `abortRef` and abort-on-new-generation logic.

- [ ] **Step 1: Replace `frontend/src/components/NodeSurface.tsx` with the updated version**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSeed, fetchSeeds, streamGenerate, streamRepair } from "../lib/api";
import type { NodeMeta } from "../types";

const MAX_REPAIR_ATTEMPTS = 2;
const RENDER_TIMEOUT_MS = 4000;

const HEALTH_SCRIPT = `
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

// Inject before </head> so the error listener registers before any body scripts run.
// Falls back to prepending when the model omits a <head> element.
function injectHealthScript(html: string): string {
  const marker = "</head>";
  const idx = html.toLowerCase().indexOf(marker);
  if (idx !== -1) {
    return html.slice(0, idx) + HEALTH_SCRIPT + html.slice(idx);
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
        onDone: (html) => render(html),
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
        onDone: (html) => render(html),
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start the app and manually verify**

```bash
# Terminal 1
make backend
# Terminal 2
make frontend
```

Open http://localhost:5173. Enter the canvas, open the Domo node:
- If seeds are pre-warmed: seed tabs (1 / 2) should appear above the iframe
- Click seed 2 to verify it switches the iframe content
- Click a chip; confirm the seed tabs disappear once a prompt is sent
- Open a node surface and immediately click "Back to map" while it is still in "loading" state. Confirm no console warnings appear about setting state on an unmounted component (this exercises the `abortRef.current?.abort()` cleanup in the `useEffect` return).
- Inspect the iframe's `srcDoc` in devtools: confirm `HEALTH_SCRIPT` appears inside `</head>`, not appended after `</html>`

---

## Task 7: Geometric Node Shapes on Canvas

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/Canvas.tsx`

- [ ] **Step 1: Add `.node-gem` class to `index.css`**

Append after the `.node-float` keyframe block in `frontend/src/index.css`:

```css
.node-gem {
  border-radius: 0;
  clip-path: polygon(
    0 0,
    calc(100% - 28px) 0,
    100% 28px,
    100% 100%,
    28px 100%,
    0 calc(100% - 28px)
  );
}
```

This produces a hexagonal silhouette — top-right and bottom-left corners cut at 45° — echoing the angular, faceted shapes of the Argo logo mark.

- [ ] **Step 2: Apply `.node-gem` and fix border in `Canvas.tsx`**

Replace the `<button>` inside the `nodes.map(...)` in `frontend/src/components/Canvas.tsx`:

```tsx
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
```

The only changes from the original are: `className` adds `node-gem`, and `padding` gains a slightly larger bottom value (`28px`) to keep text visually centered within the visible polygon area.

- [ ] **Step 3: Verify visually**

Open http://localhost:5173. On the canvas, the three node cards should now have angular cut corners instead of rounded rectangles. The backdrop-blur glass effect should remain visible through the transparent cut corners.

---

## Task 8: /process Page

**Files:**
- Create: `frontend/src/pages/ProcessPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/pages/ProcessPage.tsx`**

```tsx
import { type CSSProperties } from "react";

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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Update `App.tsx` to add page state and process link**

Replace `frontend/src/App.tsx` with:

```tsx
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
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify the process page manually**

Open http://localhost:5173. Click "How it's built" in the footer:
- Page renders with all five sections and a "← Back" button
- Scrolls vertically; content doesn't overflow horizontally
- Click "← Back" returns to the canvas at its prior state (splash or live canvas)
- The process page is accessible from both the splash screen and the live canvas

- [ ] **Step 6: Run all backend tests one final time to confirm nothing was broken**

```bash
cd backend && .venv/bin/pytest -v
```

Expected: all tests pass.

---

## Task 9: Generation Metadata — Token Usage, Latency, and Live Config

**Goal:** Surface real generation metadata to judges: token count and latency in the "Show prompt" panel after each generation, and a live config callout (model, temperature, max tokens) on the `/process` page fetched from `/api/health`.

**Files:**
- Modify: `backend/app/llm_client.py` (additive — add `usage_out` param)
- Modify: `backend/app/generation.py` (additive — capture usage, extend `done` event)
- Modify: `backend/app/main.py` (additive — extend health response)
- Modify: `backend/tests/test_stream_chat.py` (add 1 test)
- Modify: `backend/tests/test_generation.py` (update 2 existing fakes + add 1 test)
- Modify: `backend/tests/test_routes.py` (update 1 existing fake)
- Modify: `backend/tests/test_health.py` (update 1 existing assertion)
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts` (additive — forward `tokens_used`)
- Modify: `frontend/src/components/NodeSurface.tsx` (additive — `lastMeta` state + UI)
- Modify: `frontend/src/pages/ProcessPage.tsx` (additive — config callout)

### Step-by-step

- [ ] **Step 1: Write failing tests for the new backend behaviour**

Add to `backend/tests/test_stream_chat.py`:

```python
from types import SimpleNamespace

def test_stream_chat_captures_usage_into_usage_out():
    def fake_create(**kwargs):
        # First event: content delta
        yield SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content="hi"))],
            usage=None,
        )
        # Final event: no content, usage attached
        yield SimpleNamespace(choices=[], usage=SimpleNamespace(total_tokens=42))

    class FakeClient:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    return fake_create(**kwargs)

    usage_out: dict[str, int] = {}
    deltas = list(stream_chat(FakeClient(), [{"role": "user", "content": "x"}], usage_out))
    assert deltas == ["hi"]
    assert usage_out["total_tokens"] == 42


def test_stream_chat_usage_out_unchanged_when_no_usage_event():
    # If the server never emits a usage event (e.g. oMLX doesn't support
    # stream_options), usage_out stays empty — callers treat missing key as None.
    class FakeClient:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    return iter([_event("hello")])

    usage_out: dict[str, int] = {}
    list(stream_chat(FakeClient(), [{"role": "user", "content": "x"}], usage_out))
    assert usage_out == {}
```

Add to `backend/tests/test_generation.py` (use the existing `_parse` helper):

```python
def test_done_event_includes_tokens_used(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)

    def fake_stream(client, messages, usage_out=None):
        yield "<!doctype html><html><body><div>hi</div></body></html>"
        if usage_out is not None:
            usage_out["total_tokens"] = 77

    monkeypatch.setattr(generation, "stream_chat", fake_stream)
    events = _parse(list(generation.generate_events(object(), "domo", "tokens test")))
    done = events[-1]
    assert done["type"] == "done"
    assert done["tokens_used"] == 77


def test_done_event_tokens_used_none_when_not_captured(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)

    def fake_stream(client, messages, usage_out=None):
        yield "<!doctype html><html><body><div>hi</div></body></html>"
        # usage_out intentionally not written — simulates server without stream_options

    monkeypatch.setattr(generation, "stream_chat", fake_stream)
    events = _parse(list(generation.generate_events(object(), "domo", "no tokens")))
    done = events[-1]
    assert done["type"] == "done"
    assert done["tokens_used"] is None
```

Add to `backend/tests/test_health.py` (existing test needs the new fields; add the assertion to the existing `test_health_reports_ok_and_model_status` function):

```python
# Add these two lines inside the existing test_health_reports_ok_and_model_status function,
# after the existing assertions:
assert isinstance(body["model_temperature"], float)
assert isinstance(body["model_max_tokens"], int)
```

- [ ] **Step 2: Run to confirm failures**

```bash
cd backend && .venv/bin/pytest tests/test_stream_chat.py tests/test_generation.py tests/test_health.py -k "usage or tokens or model_temperature or model_max_tokens" -v
```

Expected: all new tests fail — functions don't accept the new params yet, fields don't exist yet.

- [ ] **Step 3: Update `stream_chat` in `llm_client.py`**

Replace the `stream_chat` function:

```python
def stream_chat(
    client: OpenAI,
    messages: list[ChatMessage],
    usage_out: dict[str, int] | None = None,
) -> Iterator[str]:
    """Yield content deltas from a streaming chat completion.

    If *usage_out* is provided, writes ``total_tokens`` into it from the
    usage event that the server appends at the end of the stream when
    ``stream_options={"include_usage": True}`` is set. The dict is left
    unchanged if the server does not emit a usage event.
    """
    stream = client.chat.completions.create(  # pyright: ignore[reportArgumentType, reportCallIssue]
        model=settings.model_name,
        messages=messages,
        stream=True,
        stream_options={"include_usage": True},
        temperature=settings.model_temperature,
        max_tokens=settings.model_max_tokens,
    )
    for event in stream:
        # Extract usage from the final (content-free) event before skipping it.
        event_usage = getattr(event, "usage", None)
        if event_usage is not None and usage_out is not None:
            total = getattr(event_usage, "total_tokens", None)
            if total is not None:
                usage_out["total_tokens"] = total

        choices = getattr(event, "choices", None)  # type: ignore[attr-defined]
        if not choices:
            continue
        choice = choices[0]
        delta = getattr(choice, "delta", None)  # type: ignore[attr-defined]
        if delta and delta.content:  # type: ignore[attr-defined]
            yield delta.content  # type: ignore[attr-defined]
```

- [ ] **Step 4: Update `_stream_and_finalize` in `generation.py`**

Replace the `_stream_and_finalize` function:

```python
def _stream_and_finalize(
    client: OpenAI, node: NodeId, prompt: str, messages: list[ChatMessage]
) -> Iterator[str]:
    start = time.monotonic()
    parts: list[str] = []
    usage_out: dict[str, int] = {}
    try:
        for delta in stream_chat(client, messages, usage_out):
            parts.append(delta)
            yield _sse({"type": "chunk", "text": delta})
    except Exception as exc:  # noqa: BLE001
        yield _sse({"type": "error", "message": str(exc)})
        return

    html = strip_fences("".join(parts))
    ms = int((time.monotonic() - start) * 1000)
    ok = is_probably_html(html)
    if ok:
        cache.save(node, prompt, html, ms)
    tokens_used: int | None = usage_out.get("total_tokens")
    yield _sse({"type": "done", "cached": False, "ms": ms, "syntactic_ok": ok,
                "html": html, "tokens_used": tokens_used})
```

- [ ] **Step 5: Update existing stream_chat fakes that will now fail**

Three test fakes accept `(client, messages)` but the new `_stream_and_finalize` passes a third positional arg `usage_out`. Add `usage_out=None` to all three:

In `backend/tests/test_generation.py` — update `test_generate_streams_and_caches_on_miss`:
```python
def fake_stream(client, messages, usage_out=None):
    yield "<!doctype html><html><body><div>ok</div></body></html>"
```

In `backend/tests/test_generation.py` — update `test_repair_overwrites_cache`:
```python
def fake_stream(client, messages, usage_out=None):
    yield "<!doctype html><html><body>fixed</body></html>"
```

In `backend/tests/test_routes.py` — update `test_generate_route_streams_events`:
```python
def fake_stream(client_, messages, usage_out=None):
    yield "<!doctype html><html><body><div>ok</div></body></html>"
```

- [ ] **Step 6: Extend `/api/health` response in `main.py`**

Replace the `health` route:

```python
@app.get("/api/health")
def health() -> dict[str, object]:
    reachable = check_model_reachable(get_client())
    return {
        "status": "ok",
        "model_reachable": reachable,
        "model_name": settings.model_name,
        "model_temperature": settings.model_temperature,
        "model_max_tokens": settings.model_max_tokens,
    }
```

- [ ] **Step 7: Run backend tests to confirm all pass**

```bash
cd backend && .venv/bin/pytest -v
```

Expected: all tests pass, including the two new generation tests and the updated health test.

- [ ] **Step 8: Update `frontend/src/types.ts`**

Replace the file content:

```typescript
export interface Chip {
  label: string;
  prompt: string;
}

export interface NodeMeta {
  id: string;
  title: string;
  blurb: string;
  chips: Chip[];
}

export interface HealthResponse {
  status: string;
  model_reachable: boolean;
  model_name: string;
  model_temperature: number;
  model_max_tokens: number;
}

export interface StreamHandlers {
  onMeta?: (cached: boolean) => void;
  onChunk?: (text: string) => void;
  onDone?: (html: string, cached: boolean, ms: number, tokensUsed: number | null) => void;
  onError?: (message: string) => void;
}
```

- [ ] **Step 10: Update `onDone` forwarding in `frontend/src/lib/api.ts`**

Find the line inside `streamPost` that handles the `done` event and update it to forward `tokens_used`:

```typescript
else if (evt.type === "done") handlers.onDone?.(evt.html, evt.cached, evt.ms, evt.tokens_used ?? null);
```

(This is the only line that changes in `api.ts`.)

- [ ] **Step 11: Add `lastMeta` state and Show-prompt panel update to `NodeSurface.tsx`**

**a) Add the state variable** after the existing `useState` declarations (e.g. after `const [freeText, setFreeText] = useState<string>("")`):

```typescript
const [lastMeta, setLastMeta] = useState<{ ms: number; tokensUsed: number | null } | null>(null);
```

**b) Update both `onDone` handlers** to capture the metadata. In the `generate` callback:

```typescript
onDone: (html, _cached, ms, tokensUsed) => {
  setLastMeta({ ms, tokensUsed });
  render(html);
},
```

In the `handleFailure` repair `streamRepair` call:

```typescript
onDone: (html, _cached, ms, tokensUsed) => {
  setLastMeta({ ms, tokensUsed });
  render(html);
},
```

**c) Update the Show-prompt panel** in the JSX. Replace the existing `{showPrompt && sentPrompt && (...)}` block:

```tsx
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
```

- [ ] **Step 12: Add live config callout to `ProcessPage.tsx`**

**a) Add `useEffect` import and state** at the top of the component (inside `ProcessPage`):

```tsx
import { type CSSProperties, useEffect, useState } from "react";
```

(The existing import line only has `type CSSProperties` — add `useEffect` and `useState` to the same import.)

Also import `fetchHealth` from the API module — add to the file's imports:

```tsx
import { fetchHealth } from "../lib/api";
```

**b) Add state inside `ProcessPage`**, before the return:

```tsx
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
    .catch(() => null); // silently skip if backend is unreachable
}, []);
```

**c) Add config callout inside the Stack section**, after the second `<p>` in that section:

```tsx
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
```

The callout only renders when the backend is reachable; the rest of the process page is fully static and renders regardless.

- [ ] **Step 13: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 14: Verify manually**

Start both servers (`make backend` + `make frontend`). Open http://localhost:5173:
- Click "How it's built" → the Stack section shows a two-column config grid with model name, temperature, and max tokens pulled live from the backend.
- Open a node surface, trigger a generation (chip or free text), wait for it to complete.
- Click "Show prompt" → the prompt text appears with latency (ms) below it. If oMLX emits usage, token count appears beside it.
- If oMLX doesn't support `stream_options`, token count is absent but no error is shown.

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec requirement | Addressed by |
|---|---|
| `/process` page — competition scoring surface | Task 8 |
| Triangular/geometric node forms | Task 7 |
| Repair loop capped at N attempts | Already implemented; no change needed |
| Domo has two seeds | Tasks 2+3+6 (get_seeds route + seed-tab UI) |
| Pinned seeds can be replaced | Tasks 2+4 (unpin function + script) |
| Hardcoded inference params | Task 1 |
| HEALTH_SCRIPT injection position | Task 6 |
| Request cancellation on new generation | Tasks 5+6 |
| Generation metadata visible to judges | Task 9 |

**No spec requirements are unaddressed.**

**Placeholder scan:** No TBDs, no "handle edge cases", no references to undefined types. All code blocks are complete. `injectHealthScript` is defined in Task 6 before it's called. `fetchSeeds` is added to `api.ts` in Task 5 before it's imported in Task 6. `usage_out` param is optional so all existing fakes without it still work after Step 5 updates them; the two new generation tests in Step 1 use fakes that write to `usage_out`, exercising the full path.

**Type consistency check:** `fetchSeeds` returns `Promise<string[]>` in Task 5 and `setSeeds` accepts `string[]` in Task 6. `streamGenerate` and `streamRepair` gain `signal?: AbortSignal` in Task 5 and the matching calls in Task 6 pass `abortRef.current.signal` (type `AbortSignal`). `ProcessPage` accepts `{ onBack: () => void }` in Task 8 and `App.tsx` passes `() => setPage("canvas")` which satisfies that type. `StreamHandlers.onDone` gains a fourth param `tokensUsed: number | null` in Task 9 Step 9; both callers in `NodeSurface.tsx` (Task 9 Step 11) and the forwarding in `api.ts` (Task 9 Step 10) use the updated signature. `HealthResponse` gains `model_temperature: number` and `model_max_tokens: number` in Task 9 Step 9; `ProcessPage` (Task 9 Step 12) reads those exact fields.
