from types import SimpleNamespace
from unittest.mock import MagicMock

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


def test_stream_chat_forwards_settings_params(monkeypatch):
    from app import config
    monkeypatch.setattr(config.settings, "model_temperature", 0.9)
    monkeypatch.setattr(config.settings, "model_max_tokens", 512)

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = iter([])

    list(stream_chat(fake_client, [{"role": "user", "content": "x"}]))

    kwargs = fake_client.chat.completions.create.call_args.kwargs
    assert kwargs["temperature"] == 0.9
    assert kwargs["max_tokens"] == 512


def test_stream_chat_captures_usage_into_usage_out():
    def fake_create(**kwargs):
        yield SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content="hi"))],
            usage=None,
        )
        yield SimpleNamespace(choices=[], usage=SimpleNamespace(total_tokens=42))

    class FakeClient:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    return fake_create(**kwargs)

    usage_out: dict[str, int] = {}
    deltas = list(stream_chat(FakeClient(), [{"role": "user", "content": "x"}], usage_out))
    assert deltas == ["hi"]
    assert usage_out["total_tokens"] == 42


def test_stream_chat_usage_out_unchanged_when_no_usage_event():
    class FakeClient:
        class chat:
            class completions:
                @staticmethod
                def create(**kwargs):
                    return iter([_event("hello")])

    usage_out: dict[str, int] = {}
    list(stream_chat(FakeClient(), [{"role": "user", "content": "x"}], usage_out))
    assert usage_out == {}
