# Living Data Ecosystem

Interactive capability showcase for Argo Analytics. Local two-tier app:
`backend/` (FastAPI) and `frontend/` (Vite + React + TS), backed by a local
Qwen model served by an oMLX OpenAI-compatible API on port 9000.

## Prerequisites

- An oMLX server serving the model on port 9000 (OpenAI-compatible API).

## Setup

### Native (recommended for development)

- Python 3.11+ and `uv`
- Node 20+

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

### Docker

- Docker and Docker Compose

```bash
# Ensure backend/.env exists (copy from example if needed)
cp backend/.env.example backend/.env   # adjust MODEL_BASE_URL / MODEL_NAME if needed

# Build and start both services
docker compose up --build

# Or run in detached mode
docker compose up --build -d
```

The frontend is served by nginx on `http://localhost:3000`. The backend runs
on port 8000 (internal only — proxied through the frontend nginx config).
Cache data persists in a named Docker volume (`cache`).

To stop: `docker compose down`. To stop and remove the cache volume: `docker compose down -v`.

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
