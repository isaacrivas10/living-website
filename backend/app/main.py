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
def health() -> dict[str, object]:
    reachable = check_model_reachable(get_client())
    return {
        "status": "ok",
        "model_reachable": reachable,
        "model_name": settings.model_name,
        "model_temperature": settings.model_temperature,
        "model_max_tokens": settings.model_max_tokens,
    }


@app.get("/api/nodes")
def get_nodes() -> list[dict[str, object]]:
    return [meta.model_dump() for meta in node_metas()]


@app.get("/api/seed/{node}")
def get_seed(node: str) -> dict[str, object | None]:
    if node not in NODES:
        raise HTTPException(status_code=404, detail="unknown node")
    return {"node": node, "html": cache.get_seed(node)}


@app.get("/api/seeds/{node}")
def get_seeds_route(node: str) -> dict[str, object]:
    if node not in NODES:
        raise HTTPException(status_code=404, detail="unknown node")
    return {"node": node, "seeds": cache.get_seeds(node)}


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
