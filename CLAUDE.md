# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Backend (from repo root)
make backend        # FastAPI on http://localhost:8000 (uvicorn --reload)
make test           # run pytest suite
make check-model    # verify oMLX model responds on port 9000

# Run a single test
cd backend && .venv/bin/pytest tests/test_generation.py -v

# Lint (ruff)
cd backend && .venv/bin/ruff check app/

# Frontend (from repo root)
make frontend       # Vite dev server on http://localhost:5173
cd frontend && npm run build   # production build
```

## Setup

Backend uses `uv` (not pip directly):
```bash
cd backend && uv venv && uv pip install -e ".[dev]" && cp .env.example .env
```

The `.env` requires `MODEL_NAME` to match what the oMLX server reports (default: `Qwen3.6-35B-A3B`). The oMLX server must be running on port 9000 (OpenAI-compatible) before the backend will report `model_reachable: true`.

## Architecture

**Two-tier local app**: FastAPI backend (`backend/`) + React/TypeScript/Vite frontend (`frontend/`). The frontend dev server proxies all `/api/*` requests to `http://localhost:8000` (configured in `vite.config.ts`).

### Backend (`backend/app/`)

- `main.py` — FastAPI app with four routes: `/api/health`, `/api/nodes`, `/api/seed/{node}`, `/api/generate` (POST), `/api/repair` (POST). The last two return `text/event-stream` (SSE).
- `nodes.py` — Static registry of three `Node` objects (`data-engineering`, `ai-ml`, `domo`). Each node has a title, blurb, preset prompt chips, and a detailed `instructions` string injected into the LLM system prompt.
- `prompts.py` — Assembles `ChatMessage` lists for generate and repair flows. Includes `DESIGN_TOKENS` (dark-glass visual aesthetic) and `SYSTEM_RULES` (self-contained HTML, no external requests).
- `generation.py` — Handles SSE streaming. `generate_events` checks cache first; on miss, calls `stream_chat` and saves to cache if the output looks like HTML. `repair_events` always regenerates (bypasses cache) and overwrites on success.
- `cache.py` — SHA-256-keyed JSON files under `data/cache/`. Entries can be `pinned=True` to mark as canonical seeds. `get_seed(node)` returns the first pinned entry for a node (used as the initial iframe content before a prompt is sent).
- `llm_client.py` — Thin wrapper around `openai.OpenAI` pointed at `MODEL_BASE_URL`. `stream_chat` yields text deltas.
- `config.py` — `pydantic-settings` `Settings` loaded from `backend/.env`.
- `schemas.py` — Pydantic models: `NodeId` (Literal type), `Chip`, `NodeMeta`, `GenerateRequest`, `RepairRequest`.

### Frontend (`frontend/src/`)

- `App.tsx` — Root component. Fetches node list on mount, shows an Enter splash, then renders `Canvas` (the node map). Clicking a node opens `NodeSurface` (full-screen overlay).
- `components/Canvas.tsx` — Animated node map; clicking a node calls `onEnter`.
- `components/NodeSurface.tsx` — The main interaction surface. Manages the generate/repair lifecycle:
  1. Loads the pinned seed into an `<iframe sandbox="allow-scripts">` as the initial view.
  2. On chip click or free-text submit, calls `streamGenerate`.
  3. If the iframe reports a JS error (via `postMessage`), calls `streamRepair` up to `MAX_REPAIR_ATTEMPTS` (2). After exhausting retries, falls back to the seed.
  4. Injects a `HEALTH_SCRIPT` into every iframe `srcDoc` to relay `window.onerror` and `load` back to the parent via `postMessage`.
- `lib/api.ts` — `fetchHealth`, `fetchNodes`, `fetchSeed`, `streamGenerate`, `streamRepair`. SSE parsing is manual (line-split on `\n\n`, `data:` prefix).
- `types.ts` — Shared TS interfaces: `Chip`, `NodeMeta`, `HealthResponse`, `StreamHandlers`.
- `index.css` — CSS custom properties for the design system (`--color-accent` #2fbf71, `--color-highlight` #f2c94c, `--color-tertiary` #21a8a0, dark backgrounds). The `.glass` class is the reusable panel style.

### Data flow

```
User prompt → POST /api/generate
  → cache hit? → SSE: meta(cached) + chunk(html) + done
  → cache miss? → stream_chat(LLM) → SSE chunks → strip_fences → save to data/cache/
Frontend: SSE chunks → buildingText state → iframe srcDoc on done
  → iframe postMessage "ok" → status = "rendered"
  → iframe postMessage "error" → streamRepair → overwrite cache on success
```

### Adding a new node

1. Add a `Node` entry to `NODES` in `backend/app/nodes.py` with a new `NodeId` literal.
2. Add the new `NodeId` to the `Literal` in `backend/app/schemas.py`.
3. No frontend changes needed — nodes are fetched dynamically from `/api/nodes`.