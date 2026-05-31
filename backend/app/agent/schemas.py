from pydantic import BaseModel, Field

from app.domain.enums import AIReviewDecision


class CriterionScore(BaseModel):
    key: str
    score: int = Field(ge=0, le=5)
    reason: str = ""


class AIReviewResult(BaseModel):
    decision: AIReviewDecision
    overall_score: int = Field(ge=0, le=100)
    criterion_scores: list[CriterionScore]
    summary: str
    return_reasons: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class FieldAssistResult(BaseModel):
    value: object
    rationale: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
