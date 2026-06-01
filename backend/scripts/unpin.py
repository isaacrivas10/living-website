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
