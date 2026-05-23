from sqlalchemy.orm import Session

from app.agent.providers import ReviewModel
from app.db.session import SessionLocal
from app.models import AIReview
from app.services.ai_review import AIReviewService
from app.workers.celery_app import celery_app


@celery_app.task(name="ai_review.run_ai_review")
def run_ai_review_task(submission_id: str) -> str:
    return run_ai_review(submission_id).id


def run_ai_review(
    submission_id: str,
    *,
    db: Session | None = None,
    model: ReviewModel | None = None,
) -> AIReview:
    if db is not None:
        return AIReviewService(db, model=model).review_submission(submission_id)

    with SessionLocal() as session:
        review = AIReviewService(session, model=model).review_submission(submission_id)
        session.commit()
        session.refresh(review)
        return review
