from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent.schemas import AIReviewResult
from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.domain.enums import UserRole
from app.models import User
from app.services.ai_review import AIReviewService
from app.services.exports import ExportService


DEMO_USERS = {
    "owner": {
        "id": "e2e-owner",
        "email": "owner@example.com",
        "name": "Demo Owner",
        "password": "LabelHubOwner123!",
        "role": UserRole.OWNER,
    },
    "labeler": {
        "id": "e2e-labeler",
        "email": "labeler@example.com",
        "name": "Demo Labeler",
        "password": "LabelHubLabeler123!",
        "role": UserRole.LABELER,
    },
    "reviewer": {
        "id": "e2e-reviewer",
        "email": "reviewer@example.com",
        "name": "Demo Reviewer",
        "password": "LabelHubReviewer123!",
        "role": UserRole.REVIEWER,
    },
}


class StaticPassReviewModel:
    def invoke(self, _prompt: str) -> dict[str, Any]:
        return AIReviewResult(
            decision="pass",
            overall_score=94,
            criterion_scores=[
                {
                    "key": "accuracy",
                    "score": 5,
                    "reason": "Answer follows the template and matches the item.",
                }
            ],
            summary="Submission is ready for human approval.",
            return_reasons=[],
            suggestions=[],
        ).model_dump(mode="json")


def _find_demo_user(db, spec: dict[str, Any]) -> User | None:
    return db.get(User, spec["id"]) or db.scalar(select(User).where(User.email == spec["email"]))


def _apply_demo_user_spec(user: User, spec: dict[str, Any]) -> None:
    user.email = spec["email"]
    user.name = spec["name"]
    user.role = spec["role"]
    user.password_hash = hash_password(spec["password"])


def _seed_demo_user(db, spec: dict[str, Any]) -> dict[str, str]:
    for attempt in range(2):
        user = _find_demo_user(db, spec)
        if user is None:
            user = User(id=spec["id"])
            db.add(user)
        _apply_demo_user_spec(user, spec)
        try:
            db.commit()
            db.refresh(user)
            return {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "role": user.role.value,
                "password": spec["password"],
            }
        except IntegrityError:
            db.rollback()
            if attempt == 1:
                raise

    raise RuntimeError("Demo user seed retry loop exhausted")


def seed_demo_users() -> dict[str, dict[str, str]]:
    seeded: dict[str, dict[str, str]] = {}
    with SessionLocal() as db:
        for role_name, spec in DEMO_USERS.items():
            seeded[role_name] = _seed_demo_user(db, spec)
    return seeded


def build_tokens() -> dict[str, dict[str, str]]:
    users = seed_demo_users()
    return {
        role: {
            "subject": user["id"],
            "email": user["email"],
            "token": create_access_token(subject=user["id"], claims={"role": role}),
        }
        for role, user in users.items()
    }


def run_ai_review(submission_id: str) -> dict[str, Any]:
    with SessionLocal() as db:
        review = AIReviewService(db, model=StaticPassReviewModel()).review_submission(submission_id)
        db.commit()
        db.refresh(review)
        return {
            "id": review.id,
            "submission_id": review.submission_id,
            "decision": review.decision.value,
            "overall_score": review.overall_score,
            "status": review.status,
        }


def run_export(export_job_id: str, storage_root: str | None = None) -> dict[str, Any]:
    with SessionLocal() as db:
        job = ExportService(db, storage_root=storage_root).run_export(export_job_id)
        return {
            "id": job.id,
            "task_id": job.task_id,
            "format": job.format.value,
            "status": job.status,
            "file_path": job.file_path,
        }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed and helper utilities for the LabelHub Playwright E2E smoke test."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("demo-users", help="Create deterministic owner/labeler/reviewer demo users.")
    subparsers.add_parser("tokens", help="Seed demo users and print deterministic owner/labeler/reviewer JWTs.")

    ai_parser = subparsers.add_parser("ai-review", help="Run a deterministic passing AI review.")
    ai_parser.add_argument("submission_id")

    export_parser = subparsers.add_parser("run-export", help="Run an export job synchronously.")
    export_parser.add_argument("export_job_id")
    export_parser.add_argument("--storage-root")

    args = parser.parse_args()
    if args.command == "demo-users":
        payload = {"users": seed_demo_users()}
    elif args.command == "tokens":
        payload = {"tokens": build_tokens()}
    elif args.command == "ai-review":
        payload = {"ai_review": run_ai_review(args.submission_id)}
    elif args.command == "run-export":
        storage_root = str(Path(args.storage_root)) if args.storage_root else None
        payload = {"export_job": run_export(args.export_job_id, storage_root=storage_root)}
    else:
        raise ValueError(f"Unsupported command: {args.command}")

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
