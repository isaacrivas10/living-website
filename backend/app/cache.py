import hashlib
import json
from pathlib import Path

from app.config import settings

CACHE_DIR: Path = settings.cache_dir


def _normalize(prompt: str) -> str:
    return " ".join(prompt.strip().split()).lower()


def _key(node: str, prompt: str) -> str:
    raw = f"{node}|{_normalize(prompt)}".encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def _path(node: str, prompt: str) -> Path:
    return CACHE_DIR / f"{_key(node, prompt)}.json"


def load(node: str, prompt: str) -> dict[str, str] | None:
    path = _path(node, prompt)
    if path.exists():
        return json.loads(path.read_text())  # type: ignore[return-value]
    return None


def save(node: str, prompt: str, html: str, ms: int, pinned: bool = False) -> None:
    _ = CACHE_DIR.mkdir(parents=True, exist_ok=True)
    existing = load(node, prompt)
    pin = pinned or (bool(existing["pinned"]) if existing else False)
    entry: dict[str, str | int | bool] = {"node": node, "prompt": prompt, "html": html, "ms": ms, "pinned": pin}
    _path(node, prompt).write_text(json.dumps(entry))


def get_seed(node: str) -> str | None:
    if not CACHE_DIR.exists():
        return None
    for file in sorted(CACHE_DIR.glob("*.json"))[:200]:
        data = json.loads(file.read_text())  # type: ignore[return-value]
        if data["node"] == node and data.get("pinned"):
            return data["html"]
    return None


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
