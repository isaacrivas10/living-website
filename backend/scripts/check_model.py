"""Manual check: confirm the local model server is reachable and responds.

Run with the oMLX server running:
    cd backend && .venv/bin/python scripts/check_model.py
"""

from app.config import settings
from app.llm_client import check_model_reachable, get_client


def main() -> None:
    client = get_client()
    print(f"Endpoint: {settings.model_base_url}")
    print(f"Model:    {settings.model_name}")

    if not check_model_reachable(client):
        print("UNREACHABLE: the model server did not respond. Is oMLX running on port 9000?")
        raise SystemExit(1)

    print("Reachable. Sending a one-line test prompt...")
    completion = client.chat.completions.create(
        model=settings.model_name,
        messages=[{"role": "user", "content": "Reply with the single word: ready"}],
        max_tokens=16,
    )
    content = completion.choices[0].message.content
    print("Reply:", content.strip() if content else "<no content>")


if __name__ == "__main__":
    main()
