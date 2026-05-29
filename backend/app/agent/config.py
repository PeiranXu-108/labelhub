import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values


DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"


@dataclass(frozen=True)
class LLMProviderConfig:
    provider: str
    model: str
    base_url: str | None
    api_key: str | None
    temperature: float

    @property
    def has_credentials(self) -> bool:
        return bool(self.api_key)

    @property
    def metadata(self) -> dict[str, str | float | bool | None]:
        return {
            "provider": self.provider,
            "model": self.model,
            "base_url": self.base_url,
            "temperature": self.temperature,
            "has_credentials": self.has_credentials,
        }


def load_llm_provider_config(
    *,
    model_override: str | None = None,
    temperature_override: float | None = None,
) -> LLMProviderConfig:
    provider = _env("LLM_PROVIDER", "deepseek")
    default_model = DEEPSEEK_MODEL if provider == "deepseek" else "gpt-4.1-mini"
    default_base_url = DEEPSEEK_BASE_URL if provider == "deepseek" else None
    return LLMProviderConfig(
        provider=provider,
        model=model_override or _env("LLM_MODEL", default_model),
        base_url=_env("LLM_BASE_URL", default_base_url),
        api_key=_env("LLM_API_KEY"),
        temperature=(
            temperature_override
            if temperature_override is not None
            else float(_env("LLM_TEMPERATURE", "0") or "0")
        ),
    )


def _env(name: str, default: str | None = None) -> str | None:
    return (
        os.getenv(f"LABELHUB_{name}")
        or os.getenv(name)
        or _dotenv_env(f"LABELHUB_{name}")
        or _dotenv_env(name)
        or default
    )


@lru_cache
def _dotenv_values() -> dict[str, str]:
    paths = [
        Path(__file__).resolve().parents[3] / ".env",
        Path(__file__).resolve().parents[2] / ".env",
        Path.cwd() / ".env",
    ]
    values: dict[str, str] = {}
    for path in paths:
        if path.exists():
            values.update({key: value for key, value in dotenv_values(path).items() if value})
    return values


def _dotenv_env(name: str) -> str | None:
    return _dotenv_values().get(name)
