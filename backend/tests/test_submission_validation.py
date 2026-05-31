import pytest
from sqlalchemy.orm import Session

from app.models import TemplateSchema
from app.schemas.template import SubmissionValidationError, TemplateDocument
from app.services.templates import TemplateService


def _runtime_schema_payload() -> dict:
    return {
        "version": 1,
        "title": "Runtime schema",
        "layout": {
            "type": "tabs",
            "groups": [
                {"id": "decision_tab", "title": "Decision", "fieldIds": ["decision", "ticket"]},
                {"id": "details_tab", "title": "Details", "fieldIds": ["return_reason", "ticket_confirm", "comment"]},
            ],
        },
        "fields": [
            {
                "id": "decision",
                "type": "radio",
                "label": "Decision",
                "required": True,
                "options": [
                    {"label": "Accept", "value": "accept"},
                    {"label": "Return", "value": "return"},
                ],
            },
            {"id": "return_reason", "type": "textarea", "label": "Return reason", "required": True},
            {"id": "ticket", "type": "text", "label": "Ticket", "required": True},
            {"id": "ticket_confirm", "type": "text", "label": "Ticket confirmation", "required": True},
            {"id": "comment", "type": "textarea", "label": "Comment"},
        ],
        "llmTools": [],
        "visibilityRules": [
            {
                "id": "show_return_reason",
                "targetFieldId": "return_reason",
                "condition": {"sourceFieldId": "decision", "operator": "equals", "value": "return"},
            }
        ],
        "validations": [
            {"type": "regex", "fieldId": "ticket", "pattern": "^TICKET-[0-9]{3}$"},
            {
                "type": "compare",
                "fieldId": "ticket_confirm",
                "operator": "equals",
                "otherFieldId": "ticket",
            },
            {"type": "custom", "fieldId": "comment", "name": "no_whitespace_edges"},
        ],
    }


def _template_schema(payload: dict) -> TemplateSchema:
    return TemplateSchema(
        task_id="task-runtime",
        version=1,
        title=payload["title"],
        schema_payload=payload,
        is_published=True,
    )


def test_hidden_required_field_is_retained_but_ignored_for_validation(db_session: Session) -> None:
    schema = _template_schema(_runtime_schema_payload())

    normalized = TemplateService(db_session).validate_submission_payload(
        schema,
        {
            "decision": "accept",
            "return_reason": "stale retained draft",
            "ticket": "TICKET-123",
            "ticket_confirm": "TICKET-123",
            "comment": "trimmed",
        },
        require_required=True,
    )

    assert normalized["return_reason"] == "stale retained draft"


def test_hidden_retained_source_answer_cannot_make_dependent_field_visible(
    db_session: Session,
) -> None:
    payload = _runtime_schema_payload()
    payload["fields"].append(
        {"id": "follow_up", "type": "textarea", "label": "Follow-up", "required": True}
    )
    payload["visibilityRules"].append(
        {
            "id": "show_follow_up",
            "targetFieldId": "follow_up",
            "condition": {
                "sourceFieldId": "return_reason",
                "operator": "equals",
                "value": "stale retained draft",
            },
        }
    )
    schema = _template_schema(payload)

    normalized = TemplateService(db_session).validate_submission_payload(
        schema,
        {
            "decision": "accept",
            "return_reason": "stale retained draft",
            "ticket": "TICKET-123",
            "ticket_confirm": "TICKET-123",
        },
        require_required=True,
    )

    assert "follow_up" not in normalized
    assert normalized["return_reason"] == "stale retained draft"


def test_visible_required_regex_cross_field_and_custom_validations_reject_payload(
    db_session: Session,
) -> None:
    schema = _template_schema(_runtime_schema_payload())

    with pytest.raises(SubmissionValidationError) as exc_info:
        TemplateService(db_session).validate_submission_payload(
            schema,
            {
                "decision": "return",
                "ticket": "bad-ticket",
                "ticket_confirm": "TICKET-123",
                "comment": " padded ",
            },
            require_required=True,
        )

    message = str(exc_info.value)
    assert "return_reason" in message
    assert "ticket" in message
    assert "ticket_confirm" in message
    assert "comment" in message


def test_custom_validator_names_are_restricted_to_the_safe_registry() -> None:
    payload = _runtime_schema_payload()
    payload["validations"].append({"type": "custom", "fieldId": "comment", "name": "eval_user_code"})

    with pytest.raises(ValueError, match="Unsupported custom validator"):
        TemplateDocument.model_validate(payload)


def test_regex_patterns_are_constrained_for_safe_runtime_evaluation() -> None:
    payload = _runtime_schema_payload()
    payload["validations"][0]["pattern"] = "(a+)+$"

    with pytest.raises(ValueError, match="safe regex subset"):
        TemplateDocument.model_validate(payload)


@pytest.mark.parametrize("pattern", ["^(a|aa)+$", "^([a]|a)+$", "^(a|[a])+$"])
def test_regex_patterns_reject_ambiguous_quantified_alternation(pattern: str) -> None:
    payload = _runtime_schema_payload()
    payload["validations"][0]["pattern"] = pattern

    with pytest.raises(ValueError, match="safe regex subset"):
        TemplateDocument.model_validate(payload)


def test_regex_patterns_reject_adjacent_optional_repeat_redos_shape() -> None:
    pattern = "^" + ("a?" * 30) + ("a" * 30) + "$"
    payload = _runtime_schema_payload()
    payload["validations"][0]["pattern"] = pattern

    with pytest.raises(ValueError, match="safe regex subset"):
        TemplateDocument.model_validate(payload)


@pytest.mark.parametrize("pattern", ["^a{0,1}a$", "^a{1,3}$"])
def test_regex_patterns_reject_variable_repeat_shapes(pattern: str) -> None:
    payload = _runtime_schema_payload()
    payload["validations"][0]["pattern"] = pattern

    with pytest.raises(ValueError, match="safe regex subset"):
        TemplateDocument.model_validate(payload)


def test_layout_groups_must_reference_existing_fields() -> None:
    payload = _runtime_schema_payload()
    payload["layout"]["groups"][0]["fieldIds"].append("missing_field")

    with pytest.raises(ValueError, match="missing_field"):
        TemplateDocument.model_validate(payload)
