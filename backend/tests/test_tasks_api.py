from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.enums import AIReviewDecision, SubmissionAction, SubmissionStatus, TaskStatus, UserRole
from app.models import AIReview, Submission, Task, TaskItem, TemplateSchema
from app.services.workflow import ActorContext, WorkflowService
from tests.conftest import auth_headers


def test_reviewer_cannot_create_tasks(client: TestClient) -> None:
    response = client.post(
        "/tasks",
        headers=auth_headers(UserRole.REVIEWER),
        json={"name": "Blocked task"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "PERMISSION_DENIED"


def test_invalid_task_transition_is_rejected(client: TestClient, db_session: Session) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    created = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "Publish once"},
    )
    task = created.json()
    task_id = task["id"]
    client.post(
        f"/tasks/{task_id}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "one"}}]},
    )
    db_session.add(
        TemplateSchema(
            task_id=task_id,
            version=1,
            title="Ready schema",
            schema_payload={"version": 1, "fields": []},
            is_published=True,
            created_by=task["created_by"],
        )
    )
    db_session.commit()

    first_publish = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)
    second_publish = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)

    assert first_publish.status_code == 200
    assert first_publish.json()["status"] == TaskStatus.PUBLISHED.value
    assert second_publish.status_code == 400
    assert second_publish.json()["detail"]["code"] == "INVALID_TASK_TRANSITION"


def test_publish_requires_imported_items(
    client: TestClient, db_session: Session
) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    created = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "No items"},
    )
    task_id = created.json()["id"]
    db_session.add(
        TemplateSchema(
            task_id=task_id,
            version=1,
            title="Ready schema",
            schema_payload={"version": 1, "fields": []},
            is_published=True,
            created_by=created.json()["created_by"],
        )
    )
    db_session.commit()

    response = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "TASK_ITEMS_REQUIRED"
    assert db_session.get(Task, task_id).status == TaskStatus.DRAFT


def test_publish_requires_published_template(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    created = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "No published template"},
    )
    task_id = created.json()["id"]
    client.post(
        f"/tasks/{task_id}/items/import",
        headers=owner_headers,
        json={"items": [{"external_id": "row-1", "payload": {"text": "one"}}]},
    )

    response = client.post(f"/tasks/{task_id}/publish", headers=owner_headers)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "TEMPLATE_REQUIRED"


def test_task_created_by_is_not_nullable() -> None:
    assert Task.__table__.c.created_by.nullable is False


def test_list_tasks_filters_by_status_distribution_and_search(
    client: TestClient, db_session: Session
) -> None:
    published_auto = Task(
        name="Urgent Support QA",
        description="Escalated queue",
        tags=["priority", "support"],
        status=TaskStatus.PUBLISHED,
        distribution_strategy="auto_claim",
        created_by="test-owner",
    )
    draft_manual = Task(
        name="Archived Sentiment",
        description="Draft research queue",
        tags=["sentiment"],
        status=TaskStatus.DRAFT,
        distribution_strategy="manual",
        created_by="test-owner",
    )
    db_session.add_all([published_auto, draft_manual])
    db_session.commit()

    filtered = client.get(
        "/tasks?search=urgent&status=published&distribution_strategy=auto_claim",
        headers=auth_headers(UserRole.OWNER),
    )
    by_id = client.get(
        f"/tasks?search={draft_manual.id[-8:]}",
        headers=auth_headers(UserRole.OWNER),
    )

    assert filtered.status_code == 200
    assert [task["id"] for task in filtered.json()] == [published_auto.id]
    assert by_id.status_code == 200
    assert [task["id"] for task in by_id.json()] == [draft_manual.id]


def test_owner_task_metrics_are_server_backed_for_progress_and_current_week(
    client: TestClient, db_session: Session
) -> None:
    current_week = datetime.now(UTC) - timedelta(hours=1)
    previous_week = datetime.now(UTC) - timedelta(days=8)
    published_task, draft_task, published_schema = _seed_metric_tasks(db_session)
    submitted_item = TaskItem(task=published_task, external_id="row-1", payload={"text": "submitted"})
    approved_item = TaskItem(task=published_task, external_id="row-2", payload={"text": "approved"})
    draft_item = TaskItem(task=published_task, external_id="row-3", payload={"text": "draft"})
    old_item = TaskItem(task=draft_task, external_id="row-4", payload={"text": "old"})
    db_session.add_all([submitted_item, approved_item, draft_item, old_item])
    db_session.flush()

    submitted = Submission(
        task=published_task,
        item=submitted_item,
        labeler_id="test-labeler",
        template_schema=published_schema,
        schema_version=1,
        answer_payload={"label": "a"},
        status=SubmissionStatus.SUBMITTED,
        submitted_at=current_week,
    )
    approved = Submission(
        task=published_task,
        item=approved_item,
        labeler_id="test-labeler",
        template_schema=published_schema,
        schema_version=1,
        answer_payload={"label": "b"},
        status=SubmissionStatus.APPROVED,
        submitted_at=current_week,
    )
    old_submission = Submission(
        task=draft_task,
        item=old_item,
        labeler_id="test-labeler",
        template_schema=published_schema,
        schema_version=1,
        answer_payload={"label": "old"},
        status=SubmissionStatus.SUBMITTED,
        submitted_at=previous_week,
    )
    db_session.add_all([submitted, approved, old_submission])
    db_session.flush()
    db_session.add_all(
        [
            AIReview(
                submission_id=submitted.id,
                decision=AIReviewDecision.RETURN,
                overall_score=35,
                structured_response={"decision": "return"},
                created_at=current_week - timedelta(minutes=5),
            ),
            AIReview(
                submission_id=submitted.id,
                decision=AIReviewDecision.PASS,
                overall_score=92,
                structured_response={"decision": "pass"},
                created_at=current_week,
            ),
            AIReview(
                submission_id=approved.id,
                decision=AIReviewDecision.HUMAN_REVIEW,
                overall_score=70,
                structured_response={"decision": "human_review"},
                created_at=current_week,
            ),
        ]
    )
    db_session.commit()

    response = client.get("/tasks/metrics", headers=auth_headers(UserRole.OWNER))
    detail_response = client.get(
        f"/tasks/{published_task.id}/metrics",
        headers=auth_headers(UserRole.OWNER),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["published_task_count"] == 1
    assert payload["summary"]["draft_task_count"] == 1
    assert payload["summary"]["current_week_submitted_count"] == 2
    published_metric = next(metric for metric in payload["task_metrics"] if metric["task_id"] == published_task.id)
    assert published_metric["item_count"] == 3
    assert published_metric["submitted_count"] == 2
    assert published_metric["progress_percent"] == 67
    assert published_metric["submission_status_counts"] == {"submitted": 1, "approved": 1}
    assert published_metric["ai_decision_counts"] == {"pass": 1, "human_review": 1}

    assert detail_response.status_code == 200
    assert detail_response.json()["task_id"] == published_task.id
    assert detail_response.json()["current_week_submitted_count"] == 2


def test_owner_task_metrics_exclude_reopened_drafts_from_progress(
    client: TestClient, db_session: Session
) -> None:
    current_week = datetime.now(UTC) - timedelta(hours=1)
    published_task, _draft_task, published_schema = _seed_metric_tasks(db_session)
    item = TaskItem(task=published_task, external_id="row-reopened", payload={"text": "returned"})
    submission = Submission(
        task=published_task,
        item=item,
        labeler_id="test-labeler",
        template_schema=published_schema,
        schema_version=1,
        answer_payload={"label": "needs revision"},
        status=SubmissionStatus.RETURNED,
        submitted_at=current_week,
    )
    db_session.add_all([item, submission])
    db_session.flush()

    reopened = WorkflowService(db_session).transition_submission(
        submission.id,
        SubmissionAction.REOPEN,
        ActorContext(user_id="test-labeler", role=UserRole.LABELER),
    )
    db_session.commit()

    assert reopened.status == SubmissionStatus.DRAFT
    assert reopened.submitted_at is not None

    response = client.get(
        f"/tasks/{published_task.id}/metrics",
        headers=auth_headers(UserRole.OWNER),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["item_count"] == 1
    assert body["submitted_count"] == 0
    assert body["current_week_submitted_count"] == 0
    assert body["progress_percent"] == 0
    assert body["submission_status_counts"] == {"draft": 1}


def test_task_update_allows_distribution_strategy_edits(
    client: TestClient,
) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    task = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "Distribution edit", "distribution_strategy": "manual"},
    ).json()

    response = client.patch(
        f"/tasks/{task['id']}",
        headers=owner_headers,
        json={"distribution_strategy": "auto_claim"},
    )

    assert response.status_code == 200
    assert response.json()["distribution_strategy"] == "auto_claim"


def test_invalid_distribution_strategy_is_rejected(client: TestClient) -> None:
    owner_headers = auth_headers(UserRole.OWNER)
    create_response = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "Invalid distribution", "distribution_strategy": "bogus"},
    )
    task = client.post(
        "/tasks",
        headers=owner_headers,
        json={"name": "Valid distribution", "distribution_strategy": "manual"},
    ).json()
    update_response = client.patch(
        f"/tasks/{task['id']}",
        headers=owner_headers,
        json={"distribution_strategy": "bogus"},
    )

    assert create_response.status_code == 422
    assert update_response.status_code == 422


def _seed_metric_tasks(db_session: Session) -> tuple[Task, Task, TemplateSchema]:
    published_task = Task(
        name="Published metrics",
        status=TaskStatus.PUBLISHED,
        distribution_strategy="auto_claim",
        created_by="test-owner",
    )
    draft_task = Task(
        name="Draft metrics",
        status=TaskStatus.DRAFT,
        distribution_strategy="manual",
        created_by="test-owner",
    )
    published_schema = TemplateSchema(
        task=published_task,
        version=1,
        title="Metrics schema",
        schema_payload={"version": 1, "fields": []},
        is_published=True,
        created_by="test-owner",
    )
    db_session.add_all([published_task, draft_task, published_schema])
    db_session.flush()
    return published_task, draft_task, published_schema
