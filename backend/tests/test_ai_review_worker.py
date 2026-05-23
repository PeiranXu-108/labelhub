from sqlalchemy.orm import Session

from app.domain.enums import SubmissionStatus, TaskStatus, UserRole
from app.models import ReviewConfig, Submission, Task, TaskItem, TemplateSchema, User
from app.workers.ai_review import run_ai_review


def _submitted_submission(db: Session) -> Submission:
    owner = User(email="worker-owner@example.com", name="Owner", role=UserRole.OWNER)
    labeler = User(email="worker-labeler@example.com", name="Labeler", role=UserRole.LABELER)
    db.add_all([owner, labeler])
    db.flush()

    task = Task(name="Worker task", status=TaskStatus.PUBLISHED, created_by=owner.id)
    item = TaskItem(task=task, external_id="row-1", payload={"text": "worker text"})
    schema = TemplateSchema(
        task=task,
        version=1,
        title="Worker schema",
        schema_payload={"version": 1, "title": "Worker schema", "fields": []},
        is_published=True,
        created_by=owner.id,
    )
    submission = Submission(
        task=task,
        item=item,
        labeler=labeler,
        template_schema=schema,
        schema_version=1,
        answer_payload={},
        status=SubmissionStatus.SUBMITTED,
    )
    db.add_all([task, item, schema, submission])
    db.flush()
    review_config = ReviewConfig(
        task_id=task.id,
        prompt_template="Review worker submission.",
        criteria=[{"key": "format", "label": "Format", "maxScore": 5}],
        max_retries=1,
    )
    db.add(review_config)
    db.flush()
    return submission


class StaticModel:
    def invoke(self, _prompt: str) -> dict:
        return {
            "decision": "human_review",
            "overall_score": 61,
            "criterion_scores": [{"key": "format", "score": 4, "reason": "Looks reviewable."}],
            "summary": "Needs human confirmation.",
            "return_reasons": [],
            "suggestions": [],
        }


def test_worker_entrypoint_runs_ai_review_with_injected_session(db_session: Session) -> None:
    submission = _submitted_submission(db_session)

    review = run_ai_review(submission.id, db=db_session, model=StaticModel())

    assert review.submission_id == submission.id
    db_session.refresh(submission)
    assert submission.status == SubmissionStatus.NEEDS_HUMAN_REVIEW
