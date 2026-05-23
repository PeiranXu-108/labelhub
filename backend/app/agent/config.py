import os
from dataclasses import dataclass


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
    return LLMProviderConfig(
        provider=os.getenv("LLM_PROVIDER", "openai-compatible"),
        model=model_override or os.getenv("LLM_MODEL", "gpt-4.1-mini"),
        base_url=os.getenv("LLM_BASE_URL"),
        api_key=os.getenv("LLM_API_KEY"),
        temperature=(
            temperature_override
            if temperature_override is not None
            else float(os.getenv("LLM_TEMPERATURE", "0"))
        ),
    )
