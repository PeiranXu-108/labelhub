import json
from typing import Any, Protocol

from langchain_openai import ChatOpenAI

from app.agent.config import LLMProviderConfig
from app.agent.schemas import AIReviewResult


class ReviewModel(Protocol):
    def invoke(self, prompt: str) -> object:
        ...


class MissingCredentialsReviewModel:
    def invoke(self, _prompt: str) -> object:
        raise RuntimeError(
            "Missing LABELHUB_LLM_API_KEY. Configure LABELHUB_LLM_PROVIDER, "
            "LABELHUB_LLM_MODEL, LABELHUB_LLM_BASE_URL, LABELHUB_LLM_API_KEY, "
            "and LABELHUB_LLM_TEMPERATURE for live AI review calls."
        )


class JSONReviewModel:
    def __init__(self, model: ChatOpenAI) -> None:
        self.model = model

    def invoke(self, prompt: str) -> AIReviewResult:
        response = self.model.invoke(prompt)
        content = getattr(response, "content", response)
        if isinstance(content, list):
            content = "".join(
                part.get("text", "") if isinstance(part, dict) else str(part)
                for part in content
            )
        payload = _parse_json_object(str(content))
        return AIReviewResult.model_validate(payload)


def build_review_model(config: LLMProviderConfig) -> ReviewModel:
    if not config.has_credentials:
        return MissingCredentialsReviewModel()

    model_kwargs: dict[str, Any] = {}
    if config.provider == "deepseek":
        model_kwargs["response_format"] = {"type": "json_object"}

    model = ChatOpenAI(
        model=config.model,
        api_key=config.api_key,
        base_url=config.base_url,
        temperature=config.temperature,
        model_kwargs=model_kwargs,
    )
    if config.provider == "deepseek":
        return JSONReviewModel(model)
    return model.with_structured_output(AIReviewResult)


def _parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)
