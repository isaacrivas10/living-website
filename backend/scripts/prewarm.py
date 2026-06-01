"""Generate each node's chip prompts once and pin seeds.

Run with the oMLX server up:
    cd backend && .venv/bin/python scripts/prewarm.py

Pins the first chip per node as the launch seed; the hero node (domo) pins its
first two chips so it has a couple of curated states.

Runs all generations in parallel for speed.
"""

from __future__ import annotations

import concurrent.futures
import time
from typing import cast

from app import cache
from app.generation import is_probably_html, strip_fences
from app.llm_client import get_client, stream_chat
from app.nodes import NODES
from app.prompts import build_generate_messages
from app.schemas import NodeId

THREADS = 1


def _generate_chip(node_id: str, chip_index: int, chip_label: str, prompt: str) -> str:
    """Generate a single chip's HTML and cache it. Returns a status string."""
    client = get_client()
    start = time.monotonic()
    print(f"[{node_id}] generating: {chip_label}")
    html = strip_fences("".join(stream_chat(client, build_generate_messages(cast(NodeId, node_id), prompt))))
    elapsed = int((time.monotonic() - start) * 1000)
    if not is_probably_html(html):
        return f"[{node_id}] {chip_label} — skipped ({elapsed}ms, not HTML)"
    seed_count = 2 if node_id == "domo" else 1
    pinned = chip_index < seed_count
    cache.save(node_id, prompt, html, ms=elapsed, pinned=pinned)
    tag = " + pinned (seed)" if pinned else ""
    return f"[{node_id}] {chip_label} — cached{tag} ({elapsed}ms)"


def main() -> None:
    # Collect all tasks: (node_id, chip_index, chip_label, prompt)
    tasks = []
    for node_id, node in NODES.items():
        for i, chip in enumerate(node.chips):
            tasks.append((node_id, i, chip.label, chip.prompt))

    # Run all generations in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=THREADS) as executor:
        futures = {
            executor.submit(_generate_chip, node_id, i, label, prompt): (node_id, label)
            for node_id, i, label, prompt in tasks
        }
        for future in concurrent.futures.as_completed(futures):
            node_id, label = futures[future]
            try:
                result = future.result()
                print(result)
            except Exception as exc:
                print(f"[{node_id}] {label} — ERROR: {exc}")

    print("Done.")


if __name__ == "__main__":
    main()
