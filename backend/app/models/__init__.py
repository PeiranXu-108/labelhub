from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.domain.enums import AIReviewDecision, ExportFormat, SubmissionStatus, TaskStatus, UserRole


def uuid_str() -> str:
    return str(uuid4())


def enum_column(enum_type: type) -> SAEnum:
    return SAEnum(
        enum_type,
        values_callable=lambda enum_cls: [item.value for item in enum_cls],
        native_enum=False,
        validate_strings=True,
    )


def default_reward_rule() -> dict:
    return {"mode": "none", "currency": None, "amount": None, "description": None}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(enum_column(UserRole), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    instruction_rich_text: Mapped[dict | None] = mapped_column(JSON)
    instruction_plain_text: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    reward_rule: Mapped[dict] = mapped_column(JSON, default=default_reward_rule, nullable=False)
    quality_rules: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[TaskStatus] = mapped_column(
        enum_column(TaskStatus), default=TaskStatus.DRAFT, nullable=False
    )
    distribution_strategy: Mapped[str] = mapped_column(String(50), default="manual", nullable=False)
    quota_per_labeler: Mapped[int | None] = mapped_column(Integer)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)

    items: Mapped[list["TaskItem"]] = relationship(back_populates="task", cascade="all, delete-orphan")
    template_schemas: Mapped[list["TemplateSchema"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    submissions: Mapped[list["Submission"]] = relationship(back_populates="task")


class TaskItem(Base):
    __tablename__ = "task_items"
    __table_args__ = (UniqueConstraint("task_id", "external_id", name="uq_task_items_external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    external_id: Mapped[str | None] = mapped_column(String(255))
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="available", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    task: Mapped[Task] = relationship(back_populates="items")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="item")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="item")


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("item_id", name="uq_assignments_item_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("task_items.id"), nullable=False, index=True)
    labeler_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    claimed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    item: Mapped[TaskItem] = relationship(back_populates="assignments")
    task: Mapped[Task] = relationship()
    submission: Mapped["Submission"] = relationship(back_populates="assignment")


class TemplateSchema(Base):
    __tablename__ = "template_schemas"
    __table_args__ = (UniqueConstraint("task_id", "version", name="uq_template_schemas_task_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    schema_payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    task: Mapped[Task] = relationship(back_populates="template_schemas")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="template_schema")


class ReviewConfig(TimestampMixin, Base):
    __tablename__ = "review_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), unique=True, nullable=False)
    prompt_template: Mapped[str] = mapped_column(Text, default="", nullable=False)
    criteria: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    pass_threshold: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    return_threshold: Mapped[int] = mapped_column(Integer, default=40, nullable=False)
    manual_review_threshold: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), default="deepseek-chat", nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=2, nullable=False)


class Submission(TimestampMixin, Base):
    __tablename__ = "submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("task_items.id"), nullable=False, index=True)
    assignment_id: Mapped[str | None] = mapped_column(ForeignKey("assignments.id"), unique=True)
    labeler_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    template_schema_id: Mapped[str] = mapped_column(
        ForeignKey("template_schemas.id"), nullable=False
    )
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    answer_payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[SubmissionStatus] = mapped_column(
        enum_column(SubmissionStatus), default=SubmissionStatus.DRAFT, nullable=False
    )
    attempt: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    task: Mapped[Task] = relationship(back_populates="submissions")
    item: Mapped[TaskItem] = relationship(back_populates="submissions")
    assignment: Mapped[Assignment | None] = relationship(back_populates="submission")
    labeler: Mapped[User] = relationship()
    template_schema: Mapped[TemplateSchema] = relationship(back_populates="submissions")
    ai_reviews: Mapped[list["AIReview"]] = relationship(back_populates="submission")
    human_reviews: Mapped[list["HumanReview"]] = relationship(back_populates="submission")
    attempt_snapshots: Mapped[list["SubmissionAttempt"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )


class UploadAsset(Base):
    __tablename__ = "upload_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    assignment_id: Mapped[str | None] = mapped_column(ForeignKey("assignments.id"), index=True)
    submission_id: Mapped[str | None] = mapped_column(ForeignKey("submissions.id"), index=True)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    field_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    task: Mapped[Task] = relationship()
    assignment: Mapped[Assignment | None] = relationship()
    submission: Mapped[Submission | None] = relationship()
    uploader: Mapped[User] = relationship()


class SubmissionAttempt(Base):
    __tablename__ = "submission_attempts"
    __table_args__ = (
        UniqueConstraint("submission_id", "attempt", name="uq_submission_attempts_submission_attempt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), nullable=False, index=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False)
    template_schema_id: Mapped[str] = mapped_column(ForeignKey("template_schemas.id"), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    answer_payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    submission: Mapped[Submission] = relationship(back_populates="attempt_snapshots")
    template_schema: Mapped[TemplateSchema] = relationship()


class AIReview(Base):
    __tablename__ = "ai_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    decision: Mapped[AIReviewDecision] = mapped_column(enum_column(AIReviewDecision), nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="completed", nullable=False)
    structured_response: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    prompt_snapshot: Mapped[str | None] = mapped_column(Text)
    model_name: Mapped[str | None] = mapped_column(String(255))
    raw_provider_response: Mapped[dict | None] = mapped_column(JSON)
    error_metadata: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    submission: Mapped[Submission] = relationship(back_populates="ai_reviews")


class LLMFieldAssistLog(Base):
    __tablename__ = "llm_field_assist_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("assignments.id"), nullable=False, index=True)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), nullable=False, index=True)
    template_schema_id: Mapped[str] = mapped_column(ForeignKey("template_schemas.id"), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_field_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_field_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    prompt_snapshot: Mapped[str | None] = mapped_column(Text)
    output_schema: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    structured_response: Mapped[dict | None] = mapped_column(JSON)
    raw_provider_response: Mapped[dict | None] = mapped_column(JSON)
    provider_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    task: Mapped[Task] = relationship()
    assignment: Mapped[Assignment] = relationship()
    submission: Mapped[Submission] = relationship()
    template_schema: Mapped[TemplateSchema] = relationship()
    actor: Mapped[User] = relationship()


class HumanReview(Base):
    __tablename__ = "human_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    review_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    submission: Mapped[Submission] = relationship(back_populates="human_reviews")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(36), index=True)
    actor_role: Mapped[str] = mapped_column(String(50), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(50))
    to_status: Mapped[str | None] = mapped_column(String(50))
    reason: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict] = mapped_column("metadata", JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ExportJob(TimestampMixin, Base):
    __tablename__ = "export_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    format: Mapped[ExportFormat] = mapped_column(enum_column(ExportFormat), nullable=False)
    field_mapping: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    include_review_metadata: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    file_path: Mapped[str | None] = mapped_column(String(1024))
    error_message: Mapped[str | None] = mapped_column(Text)
