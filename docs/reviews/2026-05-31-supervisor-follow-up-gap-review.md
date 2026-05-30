# 2026-05-31 Supervisor Follow-Up Gap Review

## Decision

The reported gaps are valid follow-up scope. They are split into separate implementation tasks so agents can work without crossing high-conflict contracts.

## Gap-To-Task Mapping

| Gap | Follow-up task | Notes |
| --- | --- | --- |
| Task basics lack rich instructions, tags, reward rules, and related metadata. | Task 11: Task Metadata and Rewards Agent | Expands backend task schemas and owner/labeler read surfaces without adding payment settlement. |
| Dataset import only accepts pasted JSON arrays. | Task 12: Dataset Import Pipeline Agent | Adds JSONL, Excel upload, preview validation, and batch edit. |
| Template designer is click-to-add with minimal property editing. | Task 13: Template Designer Builder Agent | Adds drag-and-drop builder, real property inspector, option editing, and schema-valid output. |
| Rich text, file upload, and image upload materials are missing. | Task 14: Rich Text and Media Fields Agent | Adds field types, upload contracts, storage, renderer, and designer controls. |
| Conditional visibility, linked validation, regex/custom validation, and tabs/groups are not executed. | Task 15: Dynamic Form Runtime Agent | Implements frontend runtime and backend validation parity with a safe custom-validator registry. |
| `llm_trigger` is not a closed loop. | Task 16: LLM Field Loop Agent | Adds server-side field assist, structured result validation, and target-field writeback. |
| Annotation workbench lacks previous/next/skip navigation. | Task 17: Labeler Navigation Agent | Adds navigation contracts, skip audit, and draft preservation. |
| Human review lacks explicit initial/re-review/final stages and round diff view. | Task 18: Multistage Human Review Agent | Adds review-stage model, stage-aware transitions, and persisted attempt diff UI. |
| Production readiness is limited by external live-AI keys and unverified Docker runtime in the current environment. | Task 19: Production Readiness and Runtime Verification Agent | Verifies or documents runtime blockers without overstating support. |

## Supervisor Notes

- Tasks 13 and 15 must coordinate closely: Task 13 owns authoring UX; Task 15 owns runtime semantics and backend validation parity.
- Task 14 introduces storage/privacy risk and must keep local file storage documented as MVP-only unless a production storage decision is made.
- Task 16 must reuse server-side provider configuration and must not put provider keys in frontend code.
- Task 18 may need workflow transition updates; any change to `WorkflowService` must be tested and reviewed carefully.
- Task 19 must not mark Docker runtime verified unless Docker is installed and runtime startup actually succeeds.

## Next Recommended Dispatch

Start Task 11 first if product metadata is needed before richer import/template work. Task 12 and Task 13 can follow in parallel only if they do not edit the same owner page container.

