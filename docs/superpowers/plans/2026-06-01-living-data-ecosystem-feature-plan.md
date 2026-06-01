# Living Data Ecosystem — Feature Implementation Plan

> **For whoever implements this:** Work through the tasks in order, one at a time. Steps use checkbox (`- [ ]`) syntax. Finish and verify one task before starting the next. This plan assumes the scaffolding plan is already complete and the backend venv is active. Backend tasks follow write-code → write-test → run-once (expecting pass); the repair loop is deliberately capped and uses one cheap check — do not add extra validation passes. Frontend tasks are verified by running the app, not by a separate test runner. No version control, so no commit steps.

**Goal:** Build the full Living Data Ecosystem on top of the scaffold — a deterministic zoom/pan canvas with three capability nodes, each drilling into a surface that generates a self-contained HTML artifact live from the local model, with a streamed build view, a capped client-side repair loop, an on-disk cache with pinned seeds, and a `/process` page.

**Architecture:** FastAPI backend exposes node metadata, seeds, and two SSE generation endpoints (generate, repair). The frontend renders a fixed canvas; drilling into a node opens a surface that streams a generation, renders it in a sandboxed iframe, health-checks the render via `postMessage`, and on failure requests a repair (max 2) before falling back to the node's pinned seed. Successful generations are cached on disk; pinned entries are seeds.

**Tech Stack:** Backend — FastAPI, the `openai` SDK (pointed at oMLX), Pydantic, Python stdlib for cache/hashing. No new backend dependencies; prompts are plain Python for full transparency (no templating library). Frontend — React + TypeScript + Tailwind v4, no new dependencies.

---

### Task 1: Finalize backend packaging config

The scaffold's `pyproject.toml` lacks explicit package config, which makes editable install ambiguous once `tests/` exists. Fix it so `app` installs cleanly.

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Replace `backend/pyproject.toml`**

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

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
packages = ["app"]

[tool.pytest.ini_options]
default_autouse = true
testpaths = ["tests"]

[tool.ruff]
line-length = 100
```

- [ ] **Step 2: Reinstall and verify**

Run: `cd backend && uv pip install -e ".[dev]" && .venv/bin/python -c "import app; print('ok')" && cd ..`
Expected: install succeeds and prints `ok`.

---

### Task 2: Request/response schemas

**Files:**
- Create: `backend/app/schemas.py`
- Test: `backend/tests/test_schemas.py`

- [ ] **Step 1: Create `backend/app/schemas.py`**

```python
from typing import Literal

from pydantic import BaseModel

NodeId = Literal["data-engineering", "ai-ml", "domo"]


class Chip(BaseModel):
    label: str
    prompt: str


class NodeMeta(BaseModel):
    id: NodeId
    title: str
    blurb: str
    chips: list[Chip]


class GenerateRequest(BaseModel):
    node: NodeId
    prompt: str


class RepairRequest(BaseModel):
    node: NodeId
    prompt: str
    previous_html: str
    error: str
```

- [ ] **Step 2: Create `backend/tests/test_schemas.py`**

```python
import pytest
from pydantic import ValidationError

from app.schemas import GenerateRequest, RepairRequest


def test_generate_request_accepts_valid_node():
    req = GenerateRequest(node="domo", prompt="revenue by region")
    assert req.node == "domo"


def test_generate_request_rejects_unknown_node():
    with pytest.raises(ValidationError):
        GenerateRequest(node="marketing", prompt="x")


def test_repair_request_round_trips():
    req = RepairRequest(node="ai-ml", prompt="p", previous_html="<html></html>", error="boom")
    assert req.previous_html == "<html></html>"
```

- [ ] **Step 3: Run the tests, expecting pass**

Run: `cd backend && .venv/bin/pytest tests/test_schemas.py -v && cd ..`
Expected: PASS — 3 passed.

---

### Task 3: Node registry

**Files:**
- Create: `backend/app/nodes.py`
- Test: `backend/tests/test_nodes.py`

- [ ] **Step 1: Create `backend/app/nodes.py`**

```python
from dataclasses import dataclass

from app.schemas import Chip, NodeId, NodeMeta


@dataclass(frozen=True)
class Node:
    id: NodeId
    title: str
    blurb: str
    chips: list[Chip]
    instructions: str


NODES: dict[NodeId, Node] = {
    "data-engineering": Node(
        id="data-engineering",
        title="Data Engineering",
        blurb="Pipelines, connectors, and transformation layers — designed and built.",
        chips=[
            Chip(label="API to BigQuery", prompt="Show a pipeline ingesting from a REST API into BigQuery with a dbt staging model."),
            Chip(label="Switch source to Kafka", prompt="Change the source connector from REST API to Kafka streaming and update the transformation code."),
            Chip(label="Add incremental loading", prompt="Add incremental loading and error handling to the pipeline and annotate the lineage."),
        ],
        instructions=(
            "Build an interactive data pipeline visualization for Argo Analytics. "
            "Render a left-to-right lineage diagram with the stages Source, Staging, Intermediate, and BI, "
            "drawn as connected boxes using inline SVG or styled divs with connector lines. "
            "Alongside the diagram, show a code panel containing a representative transformation snippet "
            "(a dbt model or a Python connector) consistent with the request. "
            "Invent realistic but fictional table and column names. Any interactivity (hover tooltips, tabs) "
            "must be inline vanilla JavaScript."
        ),
    ),
    "ai-ml": Node(
        id="ai-ml",
        title="AI / ML",
        blurb="Models that turn data into prediction and insight.",
        chips=[
            Chip(label="Predict retail churn", prompt="Build a dashboard for a model that predicts customer churn for a retail business."),
            Chip(label="Forecast demand", prompt="Show a demand-forecasting model dashboard with accuracy metrics and a forecast chart."),
        ],
        instructions=(
            "Build an interactive mock machine-learning model dashboard for Argo Analytics. "
            "Include a row of headline metrics (for example AUC, precision, recall) with fictional values, "
            "at least one chart drawn with inline SVG or canvas (for example an ROC curve or a bar chart of "
            "feature importances), and a short plain-language panel explaining the model and its results. "
            "Fabricate all data."
        ),
    ),
    "domo": Node(
        id="domo",
        title="Domo",
        blurb="Natural language into a live BI dashboard.",
        chips=[
            Chip(label="Revenue by region", prompt="Show monthly revenue by region with anomaly detection highlighting unusual months."),
            Chip(label="Sales funnel KPIs", prompt="Build a sales funnel dashboard with conversion KPIs and a stage breakdown."),
        ],
        instructions=(
            "Build a BI-style dashboard in the spirit of a Domo view for Argo Analytics. "
            "Include two to four visual cards (for example a time-series line chart, a bar chart by category, "
            "and KPI tiles) drawn with inline SVG or canvas, arranged in a responsive grid, with a title that "
            "reflects the request. If the request mentions anomalies or thresholds, highlight them visually. "
            "Fabricate all data."
        ),
    ),
}


def node_metas() -> list[NodeMeta]:
    return [
        NodeMeta(id=n.id, title=n.title, blurb=n.blurb, chips=n.chips)
        for n in NODES.values()
    ]
```

- [ ] **Step 2: Create `backend/tests/test_nodes.py`**

```python
from app.nodes import NODES, node_metas


def test_three_nodes_registered():
    assert set(NODES.keys()) == {"data-engineering", "ai-ml", "domo"}


def test_every_node_has_chips_and_instructions():
    for node in NODES.values():
        assert node.chips, f"{node.id} has no chips"
        assert node.instructions.strip(), f"{node.id} has no instructions"


def test_domo_is_hero_with_two_chips():
    assert len(NODES["domo"].chips) == 2


def test_node_metas_match_registry():
    metas = node_metas()
    assert len(metas) == 3
    assert {m.id for m in metas} == set(NODES.keys())
```

- [ ] **Step 3: Run the tests, expecting pass**

Run: `cd backend && .venv/bin/pytest tests/test_nodes.py -v && cd ..`
Expected: PASS — 4 passed.

---

### Task 4: Prompt assembly

Plain Python, no templating library, so the assembled string is exactly what gets sent — which the "Show prompt" feature depends on.

**Files:**
- Create: `backend/app/prompts.py`
- Test: `backend/tests/test_prompts.py`

- [ ] **Step 1: Create `backend/app/prompts.py`**

```python
from app.nodes import NODES
from app.schemas import NodeId

DESIGN_TOKENS = """\
- Background: transparent or deep charcoal/navy (#0b0f14). The artifact sits on a dark canvas.
- Surfaces: translucent dark glass panels — semi-transparent fills, 1px subtle light borders
  (rgba(255,255,255,0.08)), soft shadows, backdrop blur where supported.
- Primary accent (lines, positive series, highlights): green #2fbf71.
- Secondary highlight (emphasis, callouts, anomalies): yellow #f2c94c.
- Tertiary accent (secondary series): teal #21a8a0.
- Text: #e6edf3 primary, #9ba7b4 muted.
- Typography: clean system sans-serif. Shapes: geometric, rounded corners 8-12px.
- Mood: technical, premium, dark, spacious."""

SYSTEM_RULES = """\
You generate a single, self-contained HTML document for an interactive capability showcase.

Hard rules:
1. Output ONLY the HTML document. No markdown, no code fences, no commentary before or after.
2. Everything is inline: CSS inside a <style> tag, JavaScript inside a <script> tag.
3. No external requests of any kind: no CDN links, no imports, no network fonts, no fetch calls.
   The document must render in a sandboxed iframe with no network access.
4. Fabricate all data inline. Never reference real datasets, APIs, or credentials.
5. Match the visual aesthetic in DESIGN TOKENS below. Use a transparent or dark background so the
   artifact blends into the app's dark canvas.
6. Produce valid HTML with balanced tags and no JavaScript syntax errors."""


def _system_content(node: NodeId) -> str:
    n = NODES[node]
    return (
        f"{SYSTEM_RULES}\n\n"
        f"DESIGN TOKENS:\n{DESIGN_TOKENS}\n\n"
        f"NODE FOCUS:\n{n.instructions}"
    )


def build_generate_messages(node: NodeId, user_prompt: str) -> list[dict]:
    return [
        {"role": "system", "content": _system_content(node)},
        {"role": "user", "content": user_prompt},
    ]


def build_repair_messages(
    node: NodeId, user_prompt: str, previous_html: str, error: str
) -> list[dict]:
    repair = (
        "Your previous attempt for this request failed to render in the browser.\n\n"
        f"Original request: {user_prompt}\n\n"
        f"Render error:\n{error}\n\n"
        f"Previous HTML:\n{previous_html}\n\n"
        "Return a corrected single self-contained HTML document that fixes the error. "
        "Output only the HTML, with no explanation and no code fences."
    )
    return [
        {"role": "system", "content": _system_content(node)},
        {"role": "user", "content": repair},
    ]
```

- [ ] **Step 2: Create `backend/tests/test_prompts.py`**

```python
from app.prompts import DESIGN_TOKENS, build_generate_messages, build_repair_messages


def test_generate_messages_shape():
    messages = build_generate_messages("domo", "revenue by region")
    assert [m["role"] for m in messages] == ["system", "user"]
    assert messages[1]["content"] == "revenue by region"


def test_system_message_includes_tokens_and_node_focus():
    system = build_generate_messages("data-engineering", "x")[0]["content"]
    assert DESIGN_TOKENS in system
    assert "lineage diagram" in system


def test_repair_messages_include_error_and_previous_html():
    messages = build_repair_messages("ai-ml", "p", "<html>old</html>", "Unexpected token")
    repair_user = messages[1]["content"]
    assert "Unexpected token" in repair_user
    assert "<html>old</html>" in repair_user
```

- [ ] **Step 3: Run the tests, expecting pass**

Run: `cd backend && .venv/bin/pytest tests/test_prompts.py -v && cd ..`
Expected: PASS — 3 passed.

---

### Task 5: Streaming chat in the LLM client

**Files:**
- Modify: `backend/app/llm_client.py`
- Test: `backend/tests/test_stream_chat.py`

- [ ] **Step 1: Replace `backend/app/llm_client.py`**

```python
from typing import Iterator

from openai import OpenAI

from app.config import settings


def get_client() -> OpenAI:
    if not hasattr(get_client, "_cache"):
        get_client._cache = OpenAI(
            base_url=settings.model_base_url,
            api_key=settings.model_api_key,
            timeout=settings.request_timeout_seconds,
        )
    return get_client._cache


def check_model_reachable(client: OpenAI) -> bool:
    """Return True if the local model server responds to a models list call."""
    try:
        client.models.list()
        return True
    except Exception:
        return False


def stream_chat(client: OpenAI, messages: list[dict]) -> Iterator[str]:
    """Yield content deltas from a streaming chat completion."""
    stream = client.chat.completions.create(
        model=settings.model_name,
        messages=messages,
        stream=True,
        temperature=0.4,
        max_tokens=4096,
    )
    for event in stream:
        choices = getattr(event, "choices", None)
        if not choices:
            continue
        choice = choices[0]
        delta = getattr(choice, "delta", None)
        if delta and delta.content:
            yield delta.content
```

- [ ] **Step 2: Create `backend/tests/test_stream_chat.py`**

```python
from types import SimpleNamespace

from app.llm_client import stream_chat


def _event(text):
    return SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=text))])


def test_stream_chat_yields_non_empty_deltas():
    class FakeClient:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    return iter([_event("<div"), _event(None), _event(">hi</div>")])

    deltas = list(stream_chat(FakeClient(), [{"role": "user", "content": "x"}]))
    assert deltas == ["<div", ">hi</div>"]
```

- [ ] **Step 3: Run the tests, expecting pass**

Run: `cd backend && .venv/bin/pytest tests/test_stream_chat.py -v && cd ..`
Expected: PASS — 1 passed.

---

### Task 6: On-disk cache and seeds

**Files:**
- Create: `backend/app/cache.py`
- Test: `backend/tests/test_cache.py`

- [ ] **Step 1: Create `backend/app/cache.py`**

```python
import hashlib
import json
from pathlib import Path
from typing import Optional

# Repo-root/data/cache, resolved from this file so cwd does not matter.
CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "cache"


def _normalize(prompt: str) -> str:
    return " ".join(prompt.strip().split()).lower()


def _key(node: str, prompt: str) -> str:
    raw = f"{node}|{_normalize(prompt)}".encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def _path(node: str, prompt: str) -> Path:
    return CACHE_DIR / f"{_key(node, prompt)}.json"


def load(node: str, prompt: str) -> Optional[dict]:
    path = _path(node, prompt)
    if path.exists():
        return json.loads(path.read_text())
    return None


def save(node: str, prompt: str, html: str, ms: int, pinned: bool = False) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    existing = load(node, prompt)
    pin = pinned or (bool(existing.get("pinned")) if existing else False)
    entry = {"node": node, "prompt": prompt, "html": html, "ms": ms, "pinned": pin}
    _path(node, prompt).write_text(json.dumps(entry))


def get_seed(node: str) -> Optional[str]:
    if not CACHE_DIR.exists():
        return None
    for file in sorted(CACHE_DIR.glob("*.json"))[:200]:
        data = json.loads(file.read_text())
        if data["node"] == node and data.get("pinned"):
            return data["html"]
    return None
```

- [ ] **Step 2: Create `backend/tests/test_cache.py`**

```python
from app import cache


def test_save_and_load_round_trip(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "Revenue  by Region", "<html>a</html>", ms=10)
    entry = cache.load("domo", "revenue by region")  # normalized match
    assert entry is not None
    assert entry["html"] == "<html>a</html>"


def test_pin_is_preserved_on_resave(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p", "<html>1</html>", ms=1, pinned=True)
    cache.save("domo", "p", "<html>2</html>", ms=2)  # no pinned flag
    entry = cache.load("domo", "p")
    assert entry["pinned"] is True
    assert entry["html"] == "<html>2</html>"


def test_get_seed_returns_pinned_html(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("ai-ml", "unpinned", "<html>no</html>", ms=1)
    cache.save("ai-ml", "pinned", "<html>yes</html>", ms=1, pinned=True)
    assert cache.get_seed("ai-ml") == "<html>yes</html>"


def test_get_seed_none_when_empty(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    assert cache.get_seed("domo") is None
```

- [ ] **Step 3: Run the tests, expecting pass**

Run: `cd backend && .venv/bin/pytest tests/test_cache.py -v && cd ..`
Expected: PASS — 4 passed.

---

### Task 7: Generation orchestration (SSE event generators)

**Files:**
- Create: `backend/app/generation.py`
- Test: `backend/tests/test_generation.py`

- [ ] **Step 1: Create `backend/app/generation.py`**

```python
import json
import time
from typing import Iterator

from openai import OpenAI

from app import cache
from app.llm_client import stream_chat
from app.prompts import build_generate_messages, build_repair_messages
from app.schemas import NodeId


def is_probably_html(text: str) -> bool:
    t = text.strip().lower()
    if "<!doctype html" in t or "<html" in t:
        return True
    # Require a balanced-looking tag pair to avoid false positives on plain text.
    if "<div" in t and "</div" in t:
        return True
    return False


def strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        newline = t.find("\n")
        if newline != -1:
            t = t[newline + 1:]
        if t.rstrip().endswith("```"):
            t = t.rstrip()[: t.rstrip().rfind("```")]
    return t.strip()


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _stream_and_finalize(
    client: OpenAI, node: NodeId, prompt: str, messages: list[dict]
) -> Iterator[str]:
    start = time.monotonic()
    parts: list[str] = []
    try:
        for delta in stream_chat(client, messages):
            parts.append(delta)
            yield _sse({"type": "chunk", "text": delta})
    except Exception as exc:  # noqa: BLE001 - surface model/connection failures to client
        yield _sse({"type": "error", "message": str(exc)})
        return

    html = strip_fences("".join(parts))
    ms = int((time.monotonic() - start) * 1000)
    ok = is_probably_html(html)
    if ok:
        cache.save(node, prompt, html, ms)  # cache successful (syntactically valid) output
    yield _sse({"type": "done", "cached": False, "ms": ms, "syntactic_ok": ok, "html": html})


def generate_events(client: OpenAI, node: NodeId, prompt: str) -> Iterator[str]:
    cached = cache.load(node, prompt)
    if cached:
        yield _sse({"type": "meta", "cached": True})
        yield _sse({"type": "chunk", "text": cached["html"]})
        yield _sse(
            {"type": "done", "cached": True, "ms": cached.get("ms", 0),
             "syntactic_ok": True, "html": cached["html"]}
        )
        return

    yield _sse({"type": "meta", "cached": False})
    yield from _stream_and_finalize(client, node, prompt, build_generate_messages(node, prompt))


def repair_events(
    client: OpenAI, node: NodeId, prompt: str, previous_html: str, error: str
) -> Iterator[str]:
    # Repair always regenerates (cache bypass) and overwrites the entry on success.
    yield _sse({"type": "meta", "cached": False})
    yield from _stream_and_finalize(
        client, node, prompt, build_repair_messages(node, prompt, previous_html, error)
    )
```

- [ ] **Step 2: Create `backend/tests/test_generation.py`**

```python
import json

from app import cache, generation


def _parse(sse_chunks: list[str]) -> list[dict]:
    events = []
    for chunk in sse_chunks:
        for line in chunk.splitlines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:].strip()))
    return events


def test_is_probably_html():
    assert generation.is_probably_html("<!doctype html><html></html>")
    assert generation.is_probably_html("<div>x</div>")
    assert not generation.is_probably_html("sorry, here is your dashboard")


def test_strip_fences_removes_code_block():
    fenced = "```html\n<div>x</div>\n```"
    assert generation.strip_fences(fenced) == "<div>x</div>"


def test_generate_streams_and_caches_on_miss(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)

    def fake_stream(client, messages):
        yield "<!doctype html><html><body><div>hi</div></body></html>"

    monkeypatch.setattr(generation, "stream_chat", fake_stream)
    events = _parse(list(generation.generate_events(object(), "domo", "test prompt")))

    assert events[0] == {"type": "meta", "cached": False}
    done = events[-1]
    assert done["type"] == "done" and done["syntactic_ok"] is True
    assert "<html" in done["html"]
    # Second call should now hit the cache.
    cached_events = _parse(list(generation.generate_events(object(), "domo", "test prompt")))
    assert cached_events[0] == {"type": "meta", "cached": True}


def test_repair_overwrites_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    cache.save("domo", "p", "<html>old</html>", ms=1)

    def fake_stream(client, messages):
        yield "<!doctype html><html><body>fixed</body></html>"

    monkeypatch.setattr(generation, "stream_chat", fake_stream)
    list(generation.repair_events(object(), "domo", "p", "<html>old</html>", "boom"))
    assert "fixed" in cache.load("domo", "p")["html"]
```

- [ ] **Step 3: Run the tests, expecting pass**

Run: `cd backend && .venv/bin/pytest tests/test_generation.py -v && cd ..`
Expected: PASS — 4 passed.

---

### Task 8: API routes

**Files:**
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_routes.py`

- [ ] **Step 1: Replace `backend/app/main.py`**

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app import cache
from app.config import settings
from app.generation import generate_events, repair_events
from app.llm_client import check_model_reachable, get_client
from app.nodes import NODES, node_metas
from app.schemas import GenerateRequest, RepairRequest

app = FastAPI(title="Living Data Ecosystem API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@app.get("/api/health")
def health() -> dict:
    reachable = check_model_reachable(get_client())
    return {"status": "ok", "model_reachable": reachable, "model_name": settings.model_name}


@app.get("/api/nodes")
def get_nodes() -> list[dict]:
    return [meta.model_dump() for meta in node_metas()]


@app.get("/api/seed/{node}")
def get_seed(node: str) -> dict:
    if node not in NODES:
        raise HTTPException(status_code=404, detail="unknown node")
    return {"node": node, "html": cache.get_seed(node)}


@app.post("/api/generate")
def generate(req: GenerateRequest) -> StreamingResponse:
    return StreamingResponse(
        generate_events(get_client(), req.node, req.prompt),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.post("/api/repair")
def repair(req: RepairRequest) -> StreamingResponse:
    return StreamingResponse(
        repair_events(get_client(), req.node, req.prompt, req.previous_html, req.error),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
```

- [ ] **Step 2: Replace `backend/tests/test_health.py`** (it now lives alongside route tests; keep model-status coverage here)

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
    assert response.json()["model_reachable"] is False
```

- [ ] **Step 3: Create `backend/tests/test_routes.py`**

```python
from fastapi.testclient import TestClient

from app import cache, generation
from app.main import app

client = TestClient(app)


def test_nodes_returns_three():
    response = client.get("/api/nodes")
    assert response.status_code == 200
    assert {n["id"] for n in response.json()} == {"data-engineering", "ai-ml", "domo"}


def test_seed_unknown_node_404():
    assert client.get("/api/seed/marketing").status_code == 404


def test_seed_known_node_returns_shape(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)
    response = client.get("/api/seed/domo")
    assert response.status_code == 200
    assert response.json() == {"node": "domo", "html": None}


def test_generate_route_streams_events(monkeypatch, tmp_path):
    monkeypatch.setattr(cache, "CACHE_DIR", tmp_path)

    def fake_stream(client_, messages):
        yield "<!doctype html><html><body><div>ok</div></body></html>"

    monkeypatch.setattr(generation, "stream_chat", fake_stream)
    response = client.post("/api/generate", json={"node": "domo", "prompt": "test"})
    assert response.status_code == 200
    body = response.text
    assert '"type": "meta"' in body
    assert '"type": "done"' in body
    assert "<html" in body
```

- [ ] **Step 4: Run the full backend suite, expecting pass**

Run: `cd backend && .venv/bin/pytest -v && cd ..`
Expected: PASS — all tests across the suite pass (schemas, nodes, prompts, stream_chat, cache, generation, health, routes).

---

### Task 9: Pre-warm script (generate and pin seeds)

**Files:**
- Create: `backend/scripts/prewarm.py`

- [ ] **Step 1: Create `backend/scripts/prewarm.py`**

```python
"""Generate each node's chip prompts once and pin seeds.

Run with the oMLX server up:
    cd backend && .venv/bin/python scripts/prewarm.py

Pins the first chip per node as the launch seed; the hero node (domo) pins its
first two chips so it has a couple of curated states.
"""

from app import cache
from app.generation import is_probably_html, strip_fences
from app.llm_client import get_client, stream_chat
from app.nodes import NODES
from app.prompts import build_generate_messages


def main() -> None:
    client = get_client()
    for node_id, node in NODES.items():
        seed_count = 2 if node_id == "domo" else 1
        for i, chip in enumerate(node.chips):
            print(f"[{node_id}] generating: {chip.label}")
            html = strip_fences("".join(stream_chat(client, build_generate_messages(node_id, chip.prompt))))
            if not is_probably_html(html):
                print("  skipped — output did not look like HTML")
                continue
            pinned = i < seed_count
            cache.save(node_id, chip.prompt, html, ms=0, pinned=pinned)
            print(f"  cached{' + pinned (seed)' if pinned else ''}")
    print("Done.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the pre-warm (oMLX server must be running)**

Run: `cd backend && .venv/bin/python scripts/prewarm.py && cd ..`
Expected: each chip prints `cached`, with the seed chips also showing `pinned (seed)`. If a line prints `skipped`, the model returned non-HTML for that prompt — re-run or adjust the chip prompt; it does not block the rest.

---

### Task 10: Frontend types and API client

**Files:**
- Create: `frontend/src/types.ts`
- Replace: `frontend/src/lib/api.ts`

- [ ] **Step 1: Create `frontend/src/types.ts`**

```ts
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
}

export interface StreamHandlers {
  onMeta?: (cached: boolean) => void;
  onChunk?: (text: string) => void;
  onDone?: (html: string, cached: boolean, ms: number) => void;
  onError?: (message: string) => void;
}
```

- [ ] **Step 2: Replace `frontend/src/lib/api.ts`**

```ts
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

async function streamPost(path: string, body: unknown, handlers: StreamHandlers): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
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
    const { value, done } = await reader.read();
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

export function streamGenerate(node: string, prompt: string, handlers: StreamHandlers): Promise<void> {
  return streamPost("/api/generate", { node, prompt }, handlers);
}

export function streamRepair(
  node: string,
  prompt: string,
  previousHtml: string,
  error: string,
  handlers: StreamHandlers,
): Promise<void> {
  return streamPost(
    "/api/repair",
    { node, prompt, previous_html: previousHtml, error },
    handlers,
  );
}
```

---

### Task 11: Styles — glass and ambient float

**Files:**
- Modify: `frontend/src/index.css` (append to the file from scaffolding)

- [ ] **Step 1: Append to `frontend/src/index.css`**

```css
.glass {
  background-color: var(--color-glass);
  border: 1px solid var(--color-glass-border);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

@keyframes lde-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.node-float {
  animation: lde-float 6s ease-in-out infinite;
}

button {
  cursor: pointer;
  font: inherit;
}
```

---

### Task 12: NodeSurface component

The surface streams a generation, renders the finished HTML in a sandboxed iframe, health-checks it via `postMessage`, and on failure repairs up to twice before falling back to the seed.

**Files:**
- Create: `frontend/src/components/NodeSurface.tsx`

- [ ] **Step 1: Create `frontend/src/components/NodeSurface.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSeed, streamGenerate, streamRepair } from "../lib/api";
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

  const attemptsRef = useRef(0);
  const promptRef = useRef("");
  const htmlRef = useRef("");
  const awaitingRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

  const clearRenderTimeout = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const render = useCallback((html: string) => {
    htmlRef.current = html;
    awaitingRef.current = true;
    setDoc(html + HEALTH_SCRIPT);
    clearRenderTimeout();
    timeoutRef.current = window.setTimeout(() => {
      if (awaitingRef.current) handleFailure("render timed out");
    }, RENDER_TIMEOUT_MS);
  }, []);

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
      streamRepair(node.id, promptRef.current, htmlRef.current, message, {
        onChunk: (t) => setBuildingText((prev) => prev + t),
        onDone: (html) => render(html),
        onError: () => loadSeed(),
      });
    },
    [loadSeed, node.id],
  );

  const generate = useCallback(
    (prompt: string) => {
      attemptsRef.current = 0;
      promptRef.current = prompt;
      setSentPrompt(prompt);
      setBuildingText("");
      setNote("");
      setStatus("generating");
      streamGenerate(node.id, prompt, {
        onChunk: (t) => setBuildingText((prev) => prev + t),
        onDone: (html) => render(html),
        onError: () => loadSeed(),
      });
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

  // Load the seed as the initial state.
  useEffect(() => {
    let cancelled = false;
    fetchSeed(node.id).then((seed) => {
      if (cancelled) return;
      if (seed) {
        awaitingRef.current = false;
        setDoc(seed + HEALTH_SCRIPT);
        setStatus("rendered");
      } else {
        setStatus("rendered");
        setNote("No seed yet — type a prompt or pick a chip to generate.");
      }
    });
    return () => {
      cancelled = true;
      clearRenderTimeout();
    };
  }, [node.id]);

  const busy = status === "generating" || status === "repairing";

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

---

### Task 13: Canvas component

**Files:**
- Create: `frontend/src/components/Canvas.tsx`

- [ ] **Step 1: Create `frontend/src/components/Canvas.tsx`**

```tsx
import { useRef, useState } from "react";
import type { NodeMeta } from "../types";

interface Props {
  nodes: NodeMeta[];
  onEnter: (node: NodeMeta) => void;
}

// Fixed positions for up to three nodes, in world coordinates (px).
const POSITIONS = [
  { x: 260, y: 300 },
  { x: 680, y: 200 },
  { x: 560, y: 540 },
];

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export default function Canvas({ nodes, onEnter }: Props) {
  const [t, setT] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [focusing, setFocusing] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

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
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
          transformOrigin: "0 0",
          transition: focusing ? "transform 0.5s ease-in-out" : "none",
        }}
      >
        {nodes.map((node, i) => {
          const pos = POSITIONS[i] ?? POSITIONS[0];
          return (
            <button
              key={node.id}
              className="glass node-float"
              onClick={() => enter(node, pos)}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: 220,
                padding: "20px",
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
```

---

### Task 14: App shell — entry, canvas, surface, footer, desktop gate

**Files:**
- Replace: `frontend/src/App.tsx`

- [ ] **Step 1: Replace `frontend/src/App.tsx`**

```tsx
import { useEffect, useState } from "react";
import Canvas from "./components/Canvas";
import NodeSurface from "./components/NodeSurface";
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
      </footer>
    </main>
  );
}
```

---

### Task 15: End-to-end verification

- [ ] **Step 1: Ensure seeds exist**

If you haven't run the pre-warm since changing prompts, run it (oMLX up): `cd backend && .venv/bin/python scripts/prewarm.py && cd ..`
Expected: each node has at least one `pinned (seed)` line.

- [ ] **Step 2: Start both tiers**

Terminal 1: `make backend`
Terminal 2: `make frontend`

- [ ] **Step 3: Walk the happy path**

Open `http://localhost:5173`.
- Entry screen shows; click **Enter**.
- The canvas shows three floating nodes; wheel-zoom and drag-pan work.
- Click **Domo**; the canvas zooms in and the surface opens showing the pinned seed in the iframe.
- Click the **Revenue by region** chip; the build pane streams text and the iframe renders the finished dashboard.
- Toggle **Show prompt**; the exact prompt appears.
- Type a free-text prompt and press Enter; a fresh artifact generates and renders.
- Click **Back to map**; the surface closes.

Expected: each generation renders without the surface falling back to the seed unexpectedly. If a generation is malformed, you should see at most two "repairing" notes before a seed fallback — never a blank or broken iframe.

- [ ] **Step 4: Confirm the fallback path (optional)**

Temporarily stop the oMLX server, open a node, and trigger a generation.
Expected: after the failed attempts, the surface shows the seed with "Showing a saved example." The app never hard-fails.

---

## Definition of done

- `make test` passes the full backend suite.
- Pre-warm produces a pinned seed for every node (two for Domo).
- The canvas zooms, pans, and drills into each of the three nodes.
- Each node surface streams a live generation, renders it in the sandboxed iframe, and shows the prompt on toggle.
- A malformed generation triggers at most two repairs, then a seed fallback — no blank or broken iframe.
- Stopping the model server degrades gracefully to seeds.

## Notes

- No new dependencies on either tier. Prompts are plain Python so the "Show prompt" output is exactly what was sent.
- The repair loop is intentionally capped at two attempts with a single cheap server-side HTML check plus the client render check — no additional validation passes.
- The `/process` page is not yet built; with the workflow above working, it is a static React route that documents the prompt structure, the cache-and-seed mechanism, and the repair loop, reusing the "Show prompt" content. Add it as a follow-up once the core experience is verified.
