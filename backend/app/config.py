from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "cache"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    model_base_url: str = "http://localhost:9000/v1"
    model_api_key: str = "local"
    model_name: str = "Qwen3.6-35B-A3B"
    request_timeout_seconds: float = 120.0
    frontend_origin: str = "http://localhost:5173"

    model_temperature: float = 0.4
    model_max_tokens: int = 16384
    # Set to False for Qwen3 / DashScope (prevents <think> blocks and saves tokens).
    # Set to True or omit for local servers that don't support this parameter.
    enable_thinking: bool = False

    cache_dir: Path = _DEFAULT_CACHE_DIR


settings = Settings()
