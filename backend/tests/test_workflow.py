import pytest
from sqlalchemy.orm import Session

from app.domain.enums import (
    SubmissionAction,
    SubmissionStatus,
    TaskAction,
    TaskStatus,
    UserRole,
)
from app.models import AuditLog, Submission, Task, TaskItem, TemplateSchema, User
from app.services.workflow import ActorContext, WorkflowError, WorkflowService


def _submission_fixture(db: Session) -> tuple[Submission, User, User]:
    owner = User(email="owner@example.com", name="Owner", role=UserRole.OWNER)
    labeler = User(email="labeler@example.com", name="Labeler", role=UserRole.LABELER)
    db.add_all([owner, labeler])
    db.flush()
    task = Task(name="Quality task", status=TaskStatus.PUBLISHED, created_by=owner.id)
    item = TaskItem(task=task, external_id="item-1", payload={"text": "hello"})
    schema = TemplateSchema(
        task=task,
        version=1,
        title="Schema v1",
        schema_payload={"version": 1, "fields": []},
        is_published=True,
        created_by=owner.id,
    )
    submission = Submission(
        task=task,
        item=item,
        labeler=labeler,
        template_schema=schema,
        schema_version=1,
        answer_payload={"sentiment": "positive"},
        status=SubmissionStatus.DRAFT,
    )
    db.add_all([task, item, schema, submission])
    db.flush()
    return submission, owner, labeler


def test_invalid_submission_transition_is_rejected(db_session: Session) -> None:
    submission, _owner, _labeler = _submission_fixture(db_session)
    reviewer = User(email="reviewer@example.com", name="Reviewer", role=UserRole.REVIEWER)
    db_session.add(reviewer)
    db_session.flush()
    service = WorkflowService(db_session)

    with pytest.raises(WorkflowError) as exc_info:
        service.transition_submission(
            submission_id=submission.id,
            action=SubmissionAction.APPROVE,
            actor=ActorContext(user_id=reviewer.id, role=UserRole.REVIEWER),
        )

    assert exc_info.value.code == "INVALID_TRANSITION"


def test_submission_transition_writes_audit_log_in_same_transaction(
    db_session: Session,
) -> None:
    submission, _owner, labeler = _submission_fixture(db_session)
    service = WorkflowService(db_session)

    updated = service.transition_submission(
        submission_id=submission.id,
        action=SubmissionAction.SUBMIT,
        actor=ActorContext(user_id=labeler.id, role=UserRole.LABELER),
        metadata={"source": "unit-test"},
    )

    audit = db_session.query(AuditLog).filter_by(entity_id=submission.id).one()
    assert updated.status == SubmissionStatus.SUBMITTED
    assert audit.entity_type == "submission"
    assert audit.action == SubmissionAction.SUBMIT.value
    assert audit.from_status == SubmissionStatus.DRAFT.value
    assert audit.to_status == SubmissionStatus.SUBMITTED.value
    assert audit.actor_id == labeler.id


def test_task_transition_uses_workflow_service_and_writes_audit_log(
    db_session: Session,
) -> None:
    owner = User(email="owner-task@example.com", name="Owner", role=UserRole.OWNER)
    db_session.add(owner)
    db_session.flush()
    task = Task(name="Task transition", status=TaskStatus.DRAFT, created_by=owner.id)
    item = TaskItem(task=task, external_id="item-1", payload={"text": "hello"})
    schema = TemplateSchema(
        task=task,
        version=1,
        title="Schema v1",
        schema_payload={"version": 1, "fields": []},
        is_published=True,
        created_by=owner.id,
    )
    db_session.add_all([task, item, schema])
    db_session.flush()
    service = WorkflowService(db_session)

    updated = service.transition_task(
        task_id=task.id,
        action=TaskAction.PUBLISH,
        actor=ActorContext(user_id=owner.id, role=UserRole.OWNER),
    )

    audit = db_session.query(AuditLog).filter_by(entity_type="task", entity_id=task.id).one()
    assert updated.status == TaskStatus.PUBLISHED
    assert audit.action == TaskAction.PUBLISH.value
    assert audit.from_status == TaskStatus.DRAFT.value
    assert audit.to_status == TaskStatus.PUBLISHED.value


def test_invalid_task_transition_is_rejected_by_workflow_service(db_session: Session) -> None:
    owner = User(email="owner-invalid@example.com", name="Owner", role=UserRole.OWNER)
    db_session.add(owner)
    db_session.flush()
    task = Task(name="Already published", status=TaskStatus.PUBLISHED, created_by=owner.id)
    db_session.add(task)
    db_session.flush()
    service = WorkflowService(db_session)

    with pytest.raises(WorkflowError) as exc_info:
        service.transition_task(
            task_id=task.id,
            action=TaskAction.PUBLISH,
            actor=ActorContext(user_id=owner.id, role=UserRole.OWNER),
        )

    assert exc_info.value.code == "INVALID_TASK_TRANSITION"
