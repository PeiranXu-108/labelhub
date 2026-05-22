from enum import StrEnum


class UserRole(StrEnum):
    OWNER = "owner"
    LABELER = "labeler"
    REVIEWER = "reviewer"
    AI_AGENT = "ai_agent"


class TaskStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    PAUSED = "paused"
    ENDED = "ended"


class SubmissionStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    AI_REVIEWING = "ai_reviewing"
    AI_PASSED = "ai_passed"
    AI_RETURNED = "ai_returned"
    NEEDS_HUMAN_REVIEW = "needs_human_review"
    HUMAN_REVIEWING = "human_reviewing"
    APPROVED = "approved"
    RETURNED = "returned"
    EXPORTABLE = "exportable"


class AIReviewDecision(StrEnum):
    PASS = "pass"
    RETURN = "return"
    HUMAN_REVIEW = "human_review"


class ExportFormat(StrEnum):
    JSON = "json"
    JSONL = "jsonl"
    CSV = "csv"
    XLSX = "xlsx"


class SubmissionAction(StrEnum):
    SUBMIT = "submit"
    START_AI_REVIEW = "start_ai_review"
    AI_PASS = "ai_pass"
    AI_RETURN = "ai_return"
    REQUIRE_HUMAN_REVIEW = "require_human_review"
    START_HUMAN_REVIEW = "start_human_review"
    APPROVE = "approve"
    RETURN = "return"
    MARK_EXPORTABLE = "mark_exportable"
    REOPEN = "reopen"


class TaskAction(StrEnum):
    PUBLISH = "publish"
    PAUSE = "pause"
    END = "end"
