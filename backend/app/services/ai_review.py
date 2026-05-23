from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.config import LLMProviderConfig, load_llm_provider_config
from app.agent.graph import AIReviewState, build_review_graph
from app.agent.prompts import build_review_prompt
from app.agent.providers import ReviewModel, build_review_model
from app.agent.schemas import AIReviewResult
from app.domain.enums import AIReviewDecision, SubmissionAction, SubmissionStatus, UserRole
from app.models import AIReview, ReviewConfig, Submission
from app.services.workflow import ActorContext, WorkflowService


AI_AGENT_ACTOR_ID = "ai-review-agent"


class AIReviewService:
    def __init__(
        self,
        db: Session,
        *,
        model: ReviewModel | None = None,
        provider_config: LLMProviderConfig | None = None,
    ) -> None:
        self.db = db
        self.provider_config = provider_config
        self.model = model
        self.workflow = WorkflowService(db)

    def review_submission(self, submission_id: str) -> AIReview:
        submission = self._get_submission(submission_id)
        idempotency_key = self._idempotency_key(submission)
        existing = self._find_existing_review(submission.id, idempotency_key)
        if existing is not None:
            return existing

        review_config = self._get_review_config(submission)
        provider_config = self._provider_config(review_config)
        if self.model is None:
            self.model = build_review_model(provider_config)

        app = build_review_graph(
            {
                "load_context": self._load_context,
                "build_prompt": self._build_prompt,
                "call_model": self._call_model,
                "validate_output": self._validate_output,
                "retry_or_fail": self._retry_or_fail,
                "decide_transition": self._decide_transition,
                "persist_review": self._persist_review,
                "mark_needs_human_review": self._mark_needs_human_review,
            }
        )
        state = app.invoke(
            {
                "submission_id": submission_id,
                "idempotency_key": idempotency_key,
                "retry_count": 0,
                "max_retries": max(review_config.max_retries, 1),
                "context": {
                    "review_config": self._review_config_snapshot(review_config),
                    "model_metadata": provider_config.metadata,
                },
            }
        )
        return self.db.get(AIReview, state["review_id"])

    def _get_submission(self, submission_id: str) -> Submission:
        submission = self.db.get(Submission, submission_id)
        if submission is None:
            raise ValueError("SUBMISSION_NOT_FOUND")
        return submission

    def _get_review_config(self, submission: Submission) -> ReviewConfig:
        review_config = self.db.scalar(
            select(ReviewConfig).where(ReviewConfig.task_id == submission.task_id)
        )
        if review_config is None:
            review_config = ReviewConfig(task_id=submission.task_id)
            self.db.add(review_config)
            self.db.flush()
        return review_config

    def _provider_config(self, review_config: ReviewConfig) -> LLMProviderConfig:
        if self.provider_config is not None:
            return self.provider_config
        return load_llm_provider_config(
            model_override=review_config.model_name,
            temperature_override=review_config.temperature,
        )

    def _idempotency_key(self, submission: Submission) -> str:
        return f"{submission.id}:{submission.attempt}"

    def _find_existing_review(self, submission_id: str, idempotency_key: str) -> AIReview | None:
        reviews = self.db.scalars(
            select(AIReview)
            .where(AIReview.submission_id == submission_id)
            .order_by(AIReview.created_at.desc())
        )
        for review in reviews:
            structured_key = (review.structured_response or {}).get("idempotency_key")
            error_key = (review.error_metadata or {}).get("idempotency_key")
            if review.status in {"completed", "failed"} and idempotency_key in {
                structured_key,
                error_key,
            }:
                return review
        return None

    def _load_context(self, state: AIReviewState) -> AIReviewState:
        submission = self._get_submission(state["submission_id"])
        if SubmissionStatus(submission.status) == SubmissionStatus.SUBMITTED:
            self.workflow.transition_submission(
                submission.id,
                SubmissionAction.START_AI_REVIEW,
                self._actor(),
                metadata={"idempotency_key": state["idempotency_key"]},
            )
            self.db.flush()

        context = dict(state.get("context") or {})
        context.update(
            {
                "task": {
                    "id": submission.task.id,
                    "name": submission.task.name,
                    "description": submission.task.description,
                },
                "item": {
                    "id": submission.item.id,
                    "external_id": submission.item.external_id,
                    "payload": submission.item.payload,
                },
                "schema": submission.template_schema.schema_payload,
                "submission": {
                    "id": submission.id,
                    "attempt": submission.attempt,
                    "schema_version": submission.schema_version,
                    "answer_payload": submission.answer_payload,
                },
            }
        )
        return {**state, "context": context}

    def _build_prompt(self, state: AIReviewState) -> AIReviewState:
        context = state["context"]
        prompt = build_review_prompt(
            task_snapshot=context["task"],
            item_snapshot=context["item"],
            submission_snapshot=context["submission"],
            schema_snapshot=context["schema"],
            review_config_snapshot=context["review_config"],
        )
        return {**state, "prompt_snapshot": prompt}

    def _call_model(self, state: AIReviewState) -> AIReviewState:
        try:
            assert self.model is not None
            raw_response = self.model.invoke(state["prompt_snapshot"])
        except Exception as exc:
            return {**state, "error": f"{type(exc).__name__}: {exc}", "failure_reason": str(exc)}
        return {**state, "raw_response": raw_response, "error": ""}

    def _validate_output(self, state: AIReviewState) -> AIReviewState:
        try:
            raw_response = state["raw_response"]
            result = (
                raw_response
                if isinstance(raw_response, AIReviewResult)
                else AIReviewResult.model_validate(raw_response)
            )
        except (TypeError, ValidationError, ValueError) as exc:
            return {**state, "error": f"{type(exc).__name__}: {exc}", "failure_reason": str(exc)}
        return {**state, "result": result, "error": ""}

    def _retry_or_fail(self, state: AIReviewState) -> AIReviewState:
        retry_count = int(state.get("retry_count", 0)) + 1
        errors = list(state.get("errors") or [])
        errors.append(state.get("error") or "Unknown AI review error")
        if retry_count < int(state["max_retries"]):
            return {
                **state,
                "retry_count": retry_count,
                "errors": errors,
                "error": "",
                "final_status": "retrying",
            }
        return {
            **state,
            "retry_count": retry_count,
            "errors": errors,
            "final_status": "exhausted",
        }

    def _decide_transition(self, state: AIReviewState) -> AIReviewState:
        result = state["result"]
        config = state["context"]["review_config"]
        action = SubmissionAction.REQUIRE_HUMAN_REVIEW
        reason = result.summary

        if result.decision == AIReviewDecision.PASS and result.overall_score >= config["pass_threshold"]:
            action = SubmissionAction.AI_PASS
        elif result.decision == AIReviewDecision.RETURN and result.overall_score <= config["return_threshold"]:
            action = SubmissionAction.AI_RETURN
            reason = "; ".join(result.return_reasons) or result.summary

        return {**state, "transition_action": action, "transition_reason": reason}

    def _persist_review(self, state: AIReviewState) -> AIReviewState:
        result = state["result"]
        action = state["transition_action"]
        self.workflow.transition_submission(
            state["submission_id"],
            action,
            self._actor(),
            reason=state.get("transition_reason"),
            metadata={
                "idempotency_key": state["idempotency_key"],
                "overall_score": result.overall_score,
                "decision": result.decision.value,
            },
        )
        structured_response = result.model_dump(mode="json")
        structured_response["idempotency_key"] = state["idempotency_key"]
        review = AIReview(
            submission_id=state["submission_id"],
            decision=result.decision,
            overall_score=result.overall_score,
            status="completed",
            structured_response=structured_response,
            prompt_snapshot=state["prompt_snapshot"],
            model_name=state["context"]["model_metadata"]["model"],
            raw_provider_response=self._safe_raw_response(state.get("raw_response")),
            error_metadata=self._error_metadata(state),
        )
        self.db.add(review)
        self.db.flush()
        return {**state, "review_id": review.id, "final_status": "completed"}

    def _mark_needs_human_review(self, state: AIReviewState) -> AIReviewState:
        fallback = AIReviewResult(
            decision=AIReviewDecision.HUMAN_REVIEW,
            overall_score=0,
            criterion_scores=[],
            summary="AI review failed or returned malformed structured output.",
            return_reasons=[],
            suggestions=["Route this submission to human review."],
        )
        self.workflow.transition_submission(
            state["submission_id"],
            SubmissionAction.REQUIRE_HUMAN_REVIEW,
            self._actor(),
            reason=state.get("failure_reason") or "AI review failed",
            metadata={"idempotency_key": state["idempotency_key"]},
        )
        structured_response = fallback.model_dump(mode="json")
        structured_response["idempotency_key"] = state["idempotency_key"]
        review = AIReview(
            submission_id=state["submission_id"],
            decision=AIReviewDecision.HUMAN_REVIEW,
            overall_score=0,
            status="failed",
            structured_response=structured_response,
            prompt_snapshot=state.get("prompt_snapshot"),
            model_name=state["context"]["model_metadata"]["model"],
            raw_provider_response=self._safe_raw_response(state.get("raw_response")),
            error_metadata=self._error_metadata(state),
        )
        self.db.add(review)
        self.db.flush()
        return {**state, "review_id": review.id, "final_status": "failed"}

    def _review_config_snapshot(self, review_config: ReviewConfig) -> dict[str, Any]:
        return {
            "prompt_template": review_config.prompt_template,
            "criteria": review_config.criteria,
            "pass_threshold": review_config.pass_threshold,
            "return_threshold": review_config.return_threshold,
            "manual_review_threshold": review_config.manual_review_threshold,
            "max_retries": review_config.max_retries,
        }

    def _error_metadata(self, state: AIReviewState) -> dict[str, Any]:
        return {
            "idempotency_key": state["idempotency_key"],
            "retry_count": state.get("retry_count", 0),
            "failure_reason": state.get("failure_reason"),
            "errors": state.get("errors") or [],
            "model_metadata": state["context"]["model_metadata"],
        }

    def _safe_raw_response(self, raw_response: object) -> dict[str, Any] | None:
        if raw_response is None:
            return None
        if isinstance(raw_response, AIReviewResult):
            return raw_response.model_dump(mode="json")
        if isinstance(raw_response, dict):
            return raw_response
        return {"repr": repr(raw_response)}

    def _actor(self) -> ActorContext:
        return ActorContext(user_id=AI_AGENT_ACTOR_ID, role=UserRole.AI_AGENT)
