from unittest.mock import MagicMock

from app.llm_client import check_model_reachable


def test_check_model_reachable_true_when_models_list_succeeds():
    fake_client = MagicMock()
    fake_client.models.list.return_value = MagicMock()
    assert check_model_reachable(fake_client) is True


def test_check_model_reachable_false_when_client_raises():
    fake_client = MagicMock()
    fake_client.models.list.side_effect = ConnectionError("refused")
    assert check_model_reachable(fake_client) is False
