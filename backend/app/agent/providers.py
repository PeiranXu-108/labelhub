from typing import Protocol

from langchain_openai import ChatOpenAI

from app.agent.config import LLMProviderConfig
from app.agent.schemas import AIReviewResult


class ReviewModel(Protocol):
    def invoke(self, prompt: str) -> object:
        ...


class MissingCredentialsReviewModel:
    def invoke(self, _prompt: str) -> object:
        raise RuntimeError(
            "Missing LLM_API_KEY. Configure LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL, "
            "LLM_API_KEY, and LLM_TEMPERATURE for live AI review calls."
        )


def build_review_model(config: LLMProviderConfig) -> ReviewModel:
    if not config.has_credentials:
        return MissingCredentialsReviewModel()

    model = ChatOpenAI(
        model=config.model,
        api_key=config.api_key,
        base_url=config.base_url,
        temperature=config.temperature,
    )
    return model.with_structured_output(AIReviewResult)
