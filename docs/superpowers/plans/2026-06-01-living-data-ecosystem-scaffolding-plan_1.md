# Living Data Ecosystem — Scaffolding Plan

> **For whoever implements this:** Work through the tasks in order, one at a time. Each task's steps use checkbox (`- [ ]`) syntax so progress stays trackable. Finish and verify one task before starting the next — don't batch them. This project is local-only and not version controlled, so there are no commit steps.

**Goal:** Stand up a blank, runnable project skeleton for the Living Data Ecosystem — a FastAPI backend and a Vite + React + TypeScript frontend that talk to each other, with the local Qwen model reachable and verified — so feature work can start on a working landscape.

**Architecture:** Local two-tier app. FastAPI backend (`backend/`) proxies to the local model's OpenAI-compatible endpoint and exposes a health route. Vite + React + TS frontend (`frontend/`) renders the UI and calls the backend through a dev-server proxy. An on-disk `data/` directory will later hold the cache and pinned seeds.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, Pydantic v2 + pydantic-settings, the `openai` SDK (pointed at the local endpoint), pytest — all managed with `uv`. Node 20+, Vite, React 18, TypeScript, Tailwind CSS v4. The local model is served by an **oMLX OpenAI-compatible server on port 9000**, with the endpoint kept in an env var for easy swapping.

**Out of scope for this plan:** the canvas, node surfaces, generation service, repair loop, cache logic, seeds, prompt templates, and `/process` page. Those are feature work and get their own implementation plan built from the design spec.

---

### Task 1: Create the top-level layout

**Files:**
- Create: `README.md`
- Create: `data/` (empty directory with `.gitkeep`)
- Create: `.gitignore`

- [ ] **Step 1: Create the data directory**

```bash
mkdir data
touch data/.gitkeep
```

- [ ] **Step 2: Create a placeholder `README.md`**

```markdown
# Living Data Ecosystem

Interactive capability showcase for Argo Analytics. Local two-tier app:
`backend/` (FastAPI) and `frontend/` (Vite + React + TS), backed by a local
Qwen model served via an oMLX OpenAI-compatible API.

Run instructions are filled in at the end of scaffolding (see Task 10).
```

- [ ] **Step 3: Create a `.gitignore`**

```gitignore
# Virtual environments
.venv/

# Python
__pycache__/
*.py[cod]
*.egg-info/

# Environment files
.env

# Node
node_modules/
dist/

# IDE
.vscode/
.idea/

# OS
.DS_Store
```

---

### Task 2: Backend Python environment and dependencies

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/tests/__init__.py`

Prerequisite: `uv` is installed (see https://docs.astral.sh/uv/ for the one-line installer).

- [ ] **Step 1: Create the backend package directories**

```bash
mkdir -p backend/app backend/tests backend/scripts
touch backend/app/__init__.py backend/tests/__init__.py
```

- [ ] **Step 2: Create `backend/pyproject.toml`**

```toml
[project]
name = "living-data-ecosystem-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "pydantic>=2.7",
    "pydantic-settings>=2.3",
    "openai>=1.40",
    "httpx>=0.27",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.2",
    "pytest-asyncio>=0.23",
    "ruff>=0.5",
]

[tool.pytest.ini_options]
mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
```

- [ ] **Step 3: Create the virtual environment and install with uv**

```bash
cd backend
uv venv
uv pip install -e ".[dev]"
cd ..
```

- [ ] **Step 4: Verify the install**

Run: `backend/.venv/bin/python -c "import fastapi, uvicorn, openai, pydantic_settings; print('ok')"`
Expected: prints `ok` with no import errors.

---

### Task 3: Backend configuration

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/.env.example`

- [ ] **Step 1: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OpenAI-compatible endpoint of the local model server (oMLX on port 9000).
    # If your oMLX build serves without the /v1 prefix, set this to
    # http://localhost:9000 instead.
    model_base_url: str = "http://localhost:9000/v1"
    model_api_key: str = "local"          # dummy key; local servers ignore it
    # Set MODEL_NAME to whatever id your oMLX server reports for the loaded model.
    model_name: str = "Qwen3.6-35B-A3B"
    request_timeout_seconds: float = 120.0

    # CORS origin for the Vite dev server.
    frontend_origin: str = "http://localhost:5173"


settings = Settings()
```

- [ ] **Step 2: Create `backend/.env.example`**

```dotenv
MODEL_BASE_URL=http://localhost:9000/v1
MODEL_API_KEY=local
MODEL_NAME=Qwen3.6-35B-A3B
REQUEST_TIMEOUT_SECONDS=120
FRONTEND_ORIGIN=http://localhost:5173
```

- [ ] **Step 3: Verify config loads with defaults**

Run: `cd backend && .venv/bin/python -c "from app.config import settings; print(settings.model_base_url)" && cd ..`
Expected: prints `http://localhost:9000/v1`.

---

### Task 4: LLM client wrapper with connectivity check

**Files:**
- Create: `backend/app/llm_client.py`
- Test: `backend/tests/test_llm_client.py`

- [ ] **Step 1: Write the failing test**

```python
from unittest.mock import MagicMock

from app.llm_client import check_model_reachable


def test_check_model_reachable_true_when_models_list_succeeds():
    fake_client = MagicMock()
    fake_client.models.list.return_value = MagicMock()
    assert check_model_reachable(fake_client) is True


def test_check_model_reachable_false_when_client_raises():
    fake_client = MagicMock()
    fake_client.models.list.side_effect = ConnectionError("refused")
    assert check_model_reachable(fake_client) is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_llm_client.py -v && cd ..`
Expected: FAIL — `ModuleNotFoundError` / `cannot import name 'check_model_reachable'`.

- [ ] **Step 3: Write the minimal implementation**

```python
import httpx
from openai import OpenAI

from app.config import settings


def get_client() -> OpenAI:
    return OpenAI(
        base_url=settings.model_base_url,
        api_key=settings.model_api_key,
        timeout=httpx.Timeout(settings.request_timeout_seconds),
    )


def check_model_reachable(client: OpenAI) -> bool:
    """Return True if the local model server responds to a models list call."""
    try:
        client.models.list()
        return True
    except Exception:
        return False
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_llm_client.py -v && cd ..`
Expected: PASS — 2 passed.

---

### Task 5: Backend health endpoint

**Files:**
- Create: `backend/app/main.py`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: Write the failing test**

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_ok_and_model_status():
    with patch("app.main.check_model_reachable", return_value=True):
        response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model_reachable"] is True
    assert body["model_name"] == "Qwen3.6-35B-A3B"


def test_health_reports_model_unreachable():
    with patch("app.main.check_model_reachable", return_value=False):
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["model_reachable"] is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_health.py -v && cd ..`
Expected: FAIL — `cannot import name 'app'` / module not found.

- [ ] **Step 3: Write the minimal implementation**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.llm_client import check_model_reachable, get_client

app = FastAPI(title="Living Data Ecosystem API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    reachable = check_model_reachable(get_client())
    return {
        "status": "ok",
        "model_reachable": reachable,
        "model_name": settings.model_name,
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_health.py -v && cd ..`
Expected: PASS — 2 passed.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && .venv/bin/pytest -v && cd ..`
Expected: PASS — 4 passed.

---

### Task 6: Real model connectivity check script

**Files:**
- Create: `backend/scripts/check_model.py`

This is a manual verification step against the actual running model, separate from the mocked unit tests.

- [ ] **Step 1: Create `backend/scripts/check_model.py`**

```python
"""Manual check: confirm the local model server is reachable and responds.

Run with the oMLX server running:
    cd backend && .venv/bin/python scripts/check_model.py
"""

from app.config import settings
from app.llm_client import check_model_reachable, get_client


def main() -> None:
    client = get_client()
    print(f"Endpoint: {settings.model_base_url}")
    print(f"Model:    {settings.model_name}")

    if not check_model_reachable(client):
        print("UNREACHABLE: the model server did not respond. Is oMLX running on port 9000?")
        raise SystemExit(1)

    print("Reachable. Sending a one-line test prompt...")
    completion = client.chat.completions.create(
        model=settings.model_name,
        messages=[{"role": "user", "content": "Reply with the single word: ready"}],
        max_tokens=16,
    )
    print("Reply:", completion.choices[0].message.content.strip())


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Make sure the oMLX server is running**

Ensure your oMLX server is up and serving the Qwen model on port 9000 with an OpenAI-compatible API (per oMLX's own start instructions). Confirm `MODEL_NAME` in `backend/.env` matches the id oMLX reports for the loaded model.

- [ ] **Step 3: Run the connectivity check**

Run: `cd backend && .venv/bin/python scripts/check_model.py && cd ..`
Expected: prints `Reachable.` and a `Reply:` line containing `ready`. If it prints `UNREACHABLE`, start the oMLX server (or fix `MODEL_BASE_URL`) and retry.

---

### Task 7: Frontend scaffold (Vite + React + TypeScript)

**Files:**
- Create: `frontend/` (Vite scaffold output)

- [ ] **Step 1: Scaffold the Vite app**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
cd ..
```

- [ ] **Step 2: Verify the dev server starts**

Run: `cd frontend && npm run dev` (then stop it with Ctrl+C)
Expected: Vite prints a `Local: http://localhost:5173/` line and serves without errors.

---

### Task 8: Tailwind v4 and design tokens

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/package.json` (via install)

- [ ] **Step 1: Install Tailwind v4 and the Vite plugin**

```bash
cd frontend
npm install tailwindcss @tailwindcss/vite
cd ..
```

- [ ] **Step 2: Replace `frontend/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Replace `frontend/src/index.css` with Tailwind import and design tokens**

These tokens encode the agreed aesthetic: dark charcoal/navy base, translucent glass surfaces, and accents related to Argo's brand (green primary, yellow highlight, teal tertiary).

```css
@import "tailwindcss";

@theme {
  --color-base: #0b0f14;
  --color-surface: #121821;
  --color-glass: rgba(18, 24, 33, 0.55);
  --color-glass-border: rgba(255, 255, 255, 0.08);

  --color-accent: #2fbf71;        /* green — primary */
  --color-highlight: #f2c94c;     /* yellow — highlight */
  --color-tertiary: #21a8a0;      /* teal — tertiary */

  --color-text: #e6edf3;
  --color-text-muted: #9ba7b4;
}

:root {
  color-scheme: dark;
}

body {
  margin: 0;
  background-color: var(--color-base);
  color: var(--color-text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

- [ ] **Step 4: Verify Tailwind builds**

Run: `cd frontend && npm run build && cd ..`
Expected: build succeeds with no Tailwind/PostCSS errors and emits a `dist/` folder.

---

### Task 9: Frontend ↔ backend wiring (health round-trip)

**Files:**
- Create: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`

This proves both tiers talk to each other and surfaces the model status — the smallest end-to-end slice.

- [ ] **Step 1: Create `frontend/src/lib/api.ts`**

```ts
export interface HealthResponse {
  status: string;
  model_reachable: boolean;
  model_name: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 2: Replace `frontend/src/App.tsx`**

```tsx
import { useEffect, useState } from "react";
import { fetchHealth, type HealthResponse } from "./lib/api";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealth).catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1 style={{ color: "var(--color-accent)" }}>Living Data Ecosystem</h1>
      <p style={{ color: "var(--color-text-muted)" }}>Scaffold is live.</p>
      {error && <p style={{ color: "#ff6b6b" }}>Backend error: {error}</p>}
      {health && (
        <ul>
          <li>API status: {health.status}</li>
          <li>Model: {health.model_name}</li>
          <li>Model reachable: {health.model_reachable ? "yes" : "no"}</li>
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Start the backend**

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
```

- [ ] **Step 4: Start the frontend in a second terminal and verify the round-trip**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`.
Expected: the page shows "API status: ok", the model name, and "Model reachable: yes" (if the oMLX server is running) or "no" (if not). Either way, the backend call succeeds — that is what this task verifies.

---

### Task 10: Run instructions and convenience scripts

**Files:**
- Modify: `README.md`
- Create: `Makefile`

- [ ] **Step 1: Create a `Makefile` at the repo root**

```makefile
.PHONY: backend frontend test check-model

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/pytest -v

check-model:
	cd backend && .venv/bin/python scripts/check_model.py
```

- [ ] **Step 2: Replace `README.md`**

```markdown
# Living Data Ecosystem

Interactive capability showcase for Argo Analytics. Local two-tier app:
`backend/` (FastAPI) and `frontend/` (Vite + React + TS), backed by a local
Qwen model served by an oMLX OpenAI-compatible API on port 9000.

## Prerequisites

- Python 3.11+ and `uv`
- Node 20+
- An oMLX server serving the model on port 9000 (OpenAI-compatible API).

## Setup

```bash
# Backend
cd backend
uv venv
uv pip install -e ".[dev]"
cp .env.example .env             # adjust MODEL_BASE_URL / MODEL_NAME if needed
cd ..

# Frontend
cd frontend && npm install && cd ..

# Model: start your oMLX server on port 9000 with the Qwen model loaded,
# then set MODEL_NAME in backend/.env to match the id it reports.
```

## Run

```bash
make backend      # starts FastAPI on http://localhost:8000
make frontend     # starts Vite on http://localhost:5173 (separate terminal)
make check-model  # confirms the local model responds
make test         # runs the backend test suite
```

Open http://localhost:5173 — the page reports API and model status.

## Layout

- `backend/app/` — FastAPI app, config, LLM client.
- `backend/tests/` — pytest suite.
- `backend/scripts/` — manual checks (model connectivity).
- `frontend/src/` — React app, `lib/` for API calls, design tokens in `index.css`.
- `data/` — on-disk cache and pinned seeds (created during feature work).
```

- [ ] **Step 3: Verify the Makefile targets resolve**

Run: `make test`
Expected: the backend suite runs and passes (4 passed).

---

## Definition of done

The landscape is ready when all of these hold:

- `make test` passes the backend suite (4 tests).
- `make backend` and `make frontend` both start cleanly.
- Opening `http://localhost:5173` shows API status `ok` and a model-reachable indicator.
- `make check-model` reports the model reachable and returns a reply (with the oMLX server running).

## What comes next

With the skeleton working, the feature implementation plan (built from the design spec) adds, in rough order: the deterministic canvas and drill-down transitions; the node surface shell with parameter controls and the sandboxed iframe; the generation endpoint with prompt assembly and SSE streaming; the two-stage repair loop; the on-disk cache and pinned seeds with the pre-warm script; and the `/process` page. None of that is part of this scaffolding plan.

## Notes on conventions

- Pydantic schemas live in a `schemas.py` module (added during feature work), not a top-level `models/` folder, to avoid confusion with model/ML terminology.
- The model server is reached purely through the OpenAI-compatible endpoint, so swapping oMLX for any other compatible server (LM Studio, vLLM, etc.) is just a change to `MODEL_BASE_URL` and `MODEL_NAME` in `backend/.env` — nothing else changes.
