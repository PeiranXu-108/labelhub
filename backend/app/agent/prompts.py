import json
from typing import Any


def _stable_json(value: dict[str, Any] | list[Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)


def build_review_prompt(
    *,
    task_snapshot: dict[str, Any],
    item_snapshot: dict[str, Any],
    submission_snapshot: dict[str, Any],
    schema_snapshot: dict[str, Any],
    review_config_snapshot: dict[str, Any],
) -> str:
    return "\n".join(
        [
            "You are the LabelHub AI pre-review agent.",
            "Review the submitted annotation using only the immutable snapshots below.",
            "Return only a JSON object that matches the provided Pydantic schema.",
            "The JSON object must include decision, overall_score, criterion_scores, summary, return_reasons, and suggestions.",
            "Do not invent fields, do not use external data, and do not rely on free-form text.",
            "",
            "Review rubric:",
            str(review_config_snapshot.get("prompt_template") or "Apply the configured criteria."),
            "",
            "Thresholds:",
            _stable_json(
                {
                    "pass_threshold": review_config_snapshot.get("pass_threshold"),
                    "return_threshold": review_config_snapshot.get("return_threshold"),
                    "manual_review_threshold": review_config_snapshot.get("manual_review_threshold"),
                }
            ),
            "",
            "Criteria:",
            _stable_json(review_config_snapshot.get("criteria") or []),
            "",
            "Task snapshot:",
            _stable_json(task_snapshot),
            "",
            "Item snapshot:",
            _stable_json(item_snapshot),
            "",
            "Template schema snapshot:",
            _stable_json(schema_snapshot),
            "",
            "Submission snapshot:",
            _stable_json(submission_snapshot),
        ]
    )
