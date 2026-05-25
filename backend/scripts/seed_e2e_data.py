from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent.schemas import AIReviewResult
from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.domain.enums import UserRole
from app.services.ai_review import AIReviewService
from app.services.exports import ExportService


ROLE_SUBJECTS = {
    "owner": "e2e-owner",
    "labeler": "e2e-labeler",
    "reviewer": "e2e-reviewer",
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


def build_tokens() -> dict[str, dict[str, str]]:
    return {
        role: {
            "subject": subject,
            "token": create_access_token(subject=subject, claims={"role": role}),
        }
        for role, subject in ROLE_SUBJECTS.items()
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

    subparsers.add_parser("tokens", help="Print deterministic owner/labeler/reviewer JWTs.")

    ai_parser = subparsers.add_parser("ai-review", help="Run a deterministic passing AI review.")
    ai_parser.add_argument("submission_id")

    export_parser = subparsers.add_parser("run-export", help="Run an export job synchronously.")
    export_parser.add_argument("export_job_id")
    export_parser.add_argument("--storage-root")

    args = parser.parse_args()
    if args.command == "tokens":
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
