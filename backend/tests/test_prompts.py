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
