import json
import time
from collections.abc import Iterator

from openai import OpenAI
from openai.types.chat.chat_completion_message_param import ChatCompletionMessageParam

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

    # Strip opening code fence (```html, ```htm, or bare ```)
    if t.startswith("```"):
        first_nl = t.find("\n")
        t = t[first_nl + 1:] if first_nl != -1 else ""

    # Strip closing code fence only when ``` is alone on the last non-empty line.
    # Line-based check avoids rfind("```") cutting inside HTML that happens to
    # contain triple backticks (e.g. in <pre> blocks or SVG text).
    lines = t.splitlines()
    while lines and lines[-1].strip() == "":
        lines.pop()
    if lines and lines[-1].strip() == "```":
        lines.pop()
    t = "\n".join(lines)

    # Strip preamble text the model sometimes emits before the HTML document
    # (intro sentences, <think> block leakage, apologies, etc.).
    lower = t.lower()
    doctype_idx = lower.find("<!doctype html")
    if doctype_idx > 0:
        # Preamble before <!DOCTYPE html — strip it.
        t = t[doctype_idx:]
    elif doctype_idx == -1:
        # No DOCTYPE: try bare <html as fallback (only if preceded by non-HTML content).
        html_idx = lower.find("<html")
        if html_idx > 0:
            t = t[html_idx:]

    return t.strip()



def _sse(payload: dict[str, object]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _stream_and_finalize(
    client: OpenAI, node: NodeId, prompt: str, messages: list[ChatCompletionMessageParam]
) -> Iterator[str]:
    start = time.monotonic()
    parts: list[str] = []
    usage_out: dict[str, int] = {}
    try:
        for delta in stream_chat(client, messages, usage_out):
            parts.append(delta)
            yield _sse({"type": "chunk", "text": delta})
    except Exception as exc:  # noqa: BLE001 - surface model/connection failures to client
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
