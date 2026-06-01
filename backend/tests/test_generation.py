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

    def fake_stream(client, messages, usage_out=None):
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

    def fake_stream(client, messages, usage_out=None):
        yield "<!doctype html><html><body>fixed</body></html>"

    monkeypatch.setattr(generation, "stream_chat", fake_stream)
    list(generation.repair_events(object(), "domo", "p", "<html>old</html>", "boom"))
    assert "fixed" in cache.load("domo", "p")["html"]


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

    monkeypatch.setattr(generation, "stream_chat", fake_stream)
    events = _parse(list(generation.generate_events(object(), "domo", "no tokens")))
    done = events[-1]
    assert done["type"] == "done"
    assert done["tokens_used"] is None
