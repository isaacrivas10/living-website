from collections.abc import Iterator

from openai import OpenAI
from openai.types.chat.chat_completion_message_param import ChatCompletionMessageParam

from app.config import settings

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url=settings.model_base_url,
            api_key=settings.model_api_key,
            timeout=settings.request_timeout_seconds,
        )
    return _client


def check_model_reachable(client: OpenAI) -> bool:
    """Return True if the local model server responds to a models list call."""
    try:
        _ = client.models.list()
        return True
    except Exception:
        return False


def stream_chat(
    client: OpenAI,
    messages: list[ChatCompletionMessageParam],
    usage_out: dict[str, int] | None = None,
) -> Iterator[str]:
    """Yield content deltas from a streaming chat completion.

    If *usage_out* is provided, writes ``total_tokens`` into it from the
    usage event that the server appends at the end of the stream when
    ``stream_options={"include_usage": True}`` is set. The dict is left
    unchanged if the server does not emit a usage event.
    """
    stream = client.chat.completions.create(  # pyright: ignore[reportArgumentType, reportCallIssue]
        model=settings.model_name,
        messages=messages,
        stream=True,
        stream_options={"include_usage": True},
        temperature=settings.model_temperature,
        max_tokens=settings.model_max_tokens,
        extra_body={"enable_thinking": settings.enable_thinking},
    )
    for event in stream:
        # Extract usage from the final (content-free) event before skipping it.
        event_usage = getattr(event, "usage", None)
        if event_usage is not None and usage_out is not None:
            total = getattr(event_usage, "total_tokens", None)
            if total is not None:
                usage_out["total_tokens"] = total

        choices = getattr(event, "choices", None)  # type: ignore[attr-defined]
        if not choices:
            continue
        choice = choices[0]
        delta = getattr(choice, "delta", None)  # type: ignore[attr-defined]
        if delta and delta.content:  # type: ignore[attr-defined]
            yield delta.content  # type: ignore[attr-defined]
