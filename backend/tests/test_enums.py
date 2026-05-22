from app.domain.enums import (
    AIReviewDecision,
    ExportFormat,
    SubmissionStatus,
    TaskStatus,
    UserRole,
)


def test_foundation_enums_expose_stable_contract_values() -> None:
    assert UserRole.OWNER.value == "owner"
    assert UserRole.LABELER.value == "labeler"
    assert UserRole.REVIEWER.value == "reviewer"
    assert UserRole.AI_AGENT.value == "ai_agent"

    assert TaskStatus.DRAFT.value == "draft"
    assert TaskStatus.PUBLISHED.value == "published"
    assert TaskStatus.PAUSED.value == "paused"
    assert TaskStatus.ENDED.value == "ended"

    assert SubmissionStatus.DRAFT.value == "draft"
    assert SubmissionStatus.SUBMITTED.value == "submitted"
    assert SubmissionStatus.AI_REVIEWING.value == "ai_reviewing"
    assert SubmissionStatus.AI_PASSED.value == "ai_passed"
    assert SubmissionStatus.AI_RETURNED.value == "ai_returned"
    assert SubmissionStatus.NEEDS_HUMAN_REVIEW.value == "needs_human_review"
    assert SubmissionStatus.HUMAN_REVIEWING.value == "human_reviewing"
    assert SubmissionStatus.APPROVED.value == "approved"
    assert SubmissionStatus.RETURNED.value == "returned"
    assert SubmissionStatus.EXPORTABLE.value == "exportable"

    assert AIReviewDecision.PASS.value == "pass"
    assert AIReviewDecision.RETURN.value == "return"
    assert AIReviewDecision.HUMAN_REVIEW.value == "human_review"

    assert ExportFormat.JSON.value == "json"
    assert ExportFormat.JSONL.value == "jsonl"
    assert ExportFormat.CSV.value == "csv"
    assert ExportFormat.XLSX.value == "xlsx"
