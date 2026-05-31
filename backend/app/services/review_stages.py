from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.enums import ReviewStage, SubmissionStatus
from app.models import Submission, SubmissionAttempt


def current_review_stage(submission: Submission) -> ReviewStage | None:
    if submission.review_stage is not None:
        return ReviewStage(submission.review_stage)

    status = SubmissionStatus(submission.status)
    if status in {SubmissionStatus.APPROVED, SubmissionStatus.EXPORTABLE}:
        return ReviewStage.FINAL_REVIEW
    if status in {
        SubmissionStatus.AI_PASSED,
        SubmissionStatus.NEEDS_HUMAN_REVIEW,
        SubmissionStatus.HUMAN_REVIEWING,
        SubmissionStatus.RETURNED,
    }:
        if submission.attempt > 1:
            return ReviewStage.RE_REVIEW
        return ReviewStage.INITIAL_REVIEW
    return None


def validate_review_action_stage(
    submission: Submission,
    *,
    decision: str,
    requested_stage: ReviewStage | None,
) -> ReviewStage:
    active_stage = current_review_stage(submission)
    if active_stage is None:
        raise ValueError("Submission is not in a human review stage")

    if decision == "approve":
        if requested_stage is not None and requested_stage != ReviewStage.FINAL_REVIEW:
            raise ValueError("Approval decisions must use final_review")
        return ReviewStage.FINAL_REVIEW

    if decision == "return":
        if active_stage == ReviewStage.FINAL_REVIEW:
            raise ValueError("Final review submissions cannot be returned")
        if requested_stage is not None and requested_stage != active_stage:
            raise ValueError(f"Return decision must use {active_stage.value}")
        return active_stage

    raise ValueError(f"Unsupported review decision {decision}")


def comparison_attempts(db: Session, submission: Submission) -> tuple[int | None, int | None]:
    current_attempt = db.scalar(
        select(SubmissionAttempt.attempt)
        .where(
            SubmissionAttempt.submission_id == submission.id,
            SubmissionAttempt.attempt == submission.attempt,
        )
        .limit(1)
    )
    if current_attempt is None:
        return None, None

    previous_attempt = db.scalar(
        select(SubmissionAttempt.attempt)
        .where(
            SubmissionAttempt.submission_id == submission.id,
            SubmissionAttempt.attempt < current_attempt,
        )
        .order_by(SubmissionAttempt.attempt.desc())
        .limit(1)
    )
    return previous_attempt, current_attempt


def field_label_map(schema_payload: dict[str, Any]) -> dict[str, str]:
    labels: dict[str, str] = {}
    for field in schema_payload.get("fields", []):
        if isinstance(field, dict) and isinstance(field.get("id"), str):
            labels[field["id"]] = str(field.get("label") or field["id"])
    return labels


def diff_attempt_payloads(
    from_payload: dict[str, Any],
    to_payload: dict[str, Any],
    *,
    labels: dict[str, str],
) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for field_id in sorted(set(from_payload) | set(to_payload)):
        in_from = field_id in from_payload
        in_to = field_id in to_payload
        from_value = from_payload.get(field_id)
        to_value = to_payload.get(field_id)
        if in_from and in_to and from_value == to_value:
            continue
        if not in_from:
            change_type = "added"
        elif not in_to:
            change_type = "removed"
        else:
            change_type = "changed"
        fields.append(
            {
                "field_id": field_id,
                "field_label": labels.get(field_id, field_id),
                "change_type": change_type,
                "from_value": from_value,
                "to_value": to_value,
            }
        )
    return fields


def build_round_diffs(
    attempts: list[SubmissionAttempt],
    *,
    schema_payload: dict[str, Any],
) -> list[dict[str, Any]]:
    labels = field_label_map(schema_payload)
    ordered_attempts = sorted(attempts, key=lambda attempt: (attempt.attempt, attempt.created_at))
    diffs: list[dict[str, Any]] = []
    for previous, current in zip(ordered_attempts, ordered_attempts[1:], strict=False):
        diffs.append(
            {
                "from_attempt": previous.attempt,
                "to_attempt": current.attempt,
                "fields": diff_attempt_payloads(
                    previous.answer_payload,
                    current.answer_payload,
                    labels=labels,
                ),
            }
        )
    return diffs
