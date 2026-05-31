## Agent Handoff

Agent: Dynamic Form Runtime Agent
Task file: docs/tasks/15-dynamic-form-runtime-agent.md
Status: ready for review

Changed files:
- backend/app/schemas/template.py
- backend/app/services/templates.py
- backend/tests/test_submission_validation.py
- frontend/src/api/openapi.json
- frontend/src/features/schema-renderer/SchemaRenderer.test.tsx
- frontend/src/features/schema-renderer/SchemaRenderer.tsx
- frontend/src/features/schema-renderer/types.ts
- frontend/src/features/template/TemplateDesigner.test.tsx
- frontend/src/features/template/templateDesignerModel.ts
- frontend/src/styles.css
- docs/handoffs/2026-05-31-task15-dynamic-form-runtime-handoff.md

Verification run:
- cd backend && ./.venv313/bin/pytest tests/test_template_schema.py tests/test_submission_validation.py -q: pass, 22 tests
- cd backend && ./.venv313/bin/pytest -q: pass, 103 tests
- cd backend && ./.venv313/bin/python scripts/export_openapi.py: pass, regenerated frontend/src/api/openapi.json
- python -m json.tool frontend/src/api/openapi.json: fail, this host has no `python` executable on PATH
- python3 -m json.tool frontend/src/api/openapi.json >/tmp/labelhub-task15-exact-repeat-openapi-json-check.json: pass
- cd frontend && npm test -- --run src/features/schema-renderer src/features/template: pass, 25 tests
- cd frontend && npm test -- --run: pass, 66 tests
- cd frontend && npm run build: pass, existing Vite chunk-size warning
- git diff --check: pass

Contract changes:
- Template layout now supports `single`, `group`, and `tabs` with typed `groups`.
- Template `visibilityRules` now use typed show rules with safe field-value conditions.
- Template `validations` now use typed required, string length, number range, regex, cross-field compare, and named custom validation rules.
- Submission validation now evaluates the same visibility and validation semantics server-side before draft save or submit.
- Review fixes: hidden retained source answers no longer make dependent fields visible; regex patterns now use a strict safe subset rather than a ReDoS blacklist, including rejection of optional-repeat and variable-repeat ReDoS shapes.
- OpenAPI was regenerated to expose the new typed schema components.

Blockers:
- none

Requests for Supervisor:
- Review the runtime semantics and confirm whether Task13 should add full authoring controls for visibility/layout/validation rule editing in a follow-up. Task15 updated the designer validator and preview path, but did not add full property-inspector authoring controls.

## Runtime JSON Shapes

Visibility rules:

```json
{
  "visibilityRules": [
    {
      "id": "show_return_reason",
      "targetFieldId": "return_reason",
      "effect": "show",
      "condition": {
        "sourceFieldId": "decision",
        "operator": "equals",
        "value": "return"
      }
    }
  ]
}
```

Supported visibility operators are `equals`, `not_equals`, `in`, `not_in`, `contains`, `not_contains`, `is_empty`, and `is_not_empty`. Multiple show rules for the same target are ORed. If a field has no visibility rule, it is visible.

Validation rules:

```json
{
  "validations": [
    { "type": "required", "fieldId": "comment" },
    { "type": "min_length", "fieldId": "comment", "limit": 5 },
    { "type": "max_length", "fieldId": "comment", "limit": 500 },
    { "type": "min", "fieldId": "score", "value": 0 },
    { "type": "max", "fieldId": "score", "value": 100 },
    { "type": "regex", "fieldId": "ticket", "pattern": "^TICKET-[0-9]{3}$", "flags": ["i"] },
    {
      "type": "compare",
      "fieldId": "ticket_confirm",
      "operator": "equals",
      "otherFieldId": "ticket"
    },
    { "type": "custom", "fieldId": "comment", "name": "no_whitespace_edges" }
  ]
}
```

Supported compare operators are `equals`, `not_equals`, `greater_than`, `greater_than_or_equal`, `less_than`, and `less_than_or_equal`.

Layout:

```json
{
  "layout": {
    "type": "tabs",
    "groups": [
      {
        "id": "decision_tab",
        "title": "Decision",
        "description": "Primary decision fields",
        "fieldIds": ["decision", "ticket"]
      }
    ]
  }
}
```

`type` may be `single`, `group`, or `tabs`. `group` and `tabs` require at least one group. Group IDs and field references are validated server-side. Ungrouped fields still render after grouped fields, or in an `Other` tab for tab layouts.

## Hidden Answer Retention Policy

Hidden known answerable fields are retained in the submitted payload, but ignored for validation while hidden. That means required, field-type, regex, cross-field, and custom validations do not block submit for hidden fields. Hidden retained values also do not satisfy downstream visibility conditions: a field can only use another field as a visibility source while that source field is currently visible. Unknown answer IDs are still rejected. Hidden answers are stored only as retained draft/submission data and should not be treated as current visible labeling truth by downstream review/export surfaces unless the field is visible for that submitted answer state.

## Custom Validator Registry And Safety Policy

Template JSON may only reference server-approved custom validator names. No JavaScript, Python, expressions, shell commands, or user-authored code are executed from template JSON.

Current safe registry:
- `no_whitespace_edges`: string must not have leading or trailing whitespace.
- `non_empty_json_object`: value must be a non-empty JSON object.
- `https_url`: value must be an HTTPS URL with a host.

Unsupported custom validator names are rejected during backend template schema validation.

## Regex Constraints

Regex validation is declarative only. Patterns are constrained to at most 256 characters. The only supported flag is `i` for case-insensitive matching. Backend schema validation now accepts only a strict safe subset: literals, anchors, character classes, escaped literal punctuation, `\d`/`\D`/`\s`/`\S`/`\w`/`\W`, and exact bounded repeats such as `{3}` with bound at 100. It rejects grouping, alternation, wildcard `.`, unescaped optional `?`, unbounded `*`/`+`, variable or open repeats such as `{1,20}` and `{1,}`, backreferences, lookaround assertions, ambiguous forms such as `^(a|aa)+$`, `^([a]|a)+$`, and `^(a|[a])+$`, and adjacent optional-repeat shapes such as `^a?a?...aaa$`.

## Backend/Frontend Parity Evidence

- Backend tests cover hidden required field retention, hidden-source visibility chaining, visible required rejection, regex rejection, cross-field rejection, custom validator rejection, unsupported custom validator schema rejection, strict safe-regex rejection, equivalent ambiguous alternation rejection, optional-repeat and variable-repeat ReDoS rejection, and layout reference validation.
- Frontend renderer tests cover hidden required field behavior, retained hidden answers, hidden-source visibility chaining, regex validation, unsafe regex rejection, cross-field validation, named custom validation, tab rendering, tab error counts, and an error summary that exposes validation errors outside the active tab.
- The renderer preview path uses `SchemaRenderer`, so Task13 preview mode now runs the same runtime visibility/layout/validation semantics.
