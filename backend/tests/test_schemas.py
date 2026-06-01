import pytest
from pydantic import ValidationError

from app.schemas import GenerateRequest, RepairRequest


def test_generate_request_accepts_valid_node():
    req = GenerateRequest(node="domo", prompt="revenue by region")
    assert req.node == "domo"


def test_generate_request_rejects_unknown_node():
    with pytest.raises(ValidationError):
        GenerateRequest(node="marketing", prompt="x")


def test_repair_request_round_trips():
    req = RepairRequest(node="ai-ml", prompt="p", previous_html="<html></html>", error="boom")
    assert req.previous_html == "<html></html>"
