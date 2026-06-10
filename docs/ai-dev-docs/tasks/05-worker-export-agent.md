# Task 05: Worker Export Agent

## Mission

Implement background workers for export jobs and connect worker infrastructure shared with the AI review job.

This agent owns export file generation and download history.

## Dependencies

- Task 02 must provide submission, review, export job models.
- Task 01 must provide Redis/Docker Compose basics.

## Owned Areas

- `backend/app/workers/`
- `backend/app/services/exports.py`
- `backend/app/api/routes/exports.py`
- `backend/app/storage/`
- export tests

## Expected Deliverables

- Worker configuration.
- Export job creation endpoint.
- Export job list endpoint.
- Download endpoint with permission check.
- JSON, JSONL, CSV, and Excel writers.
- Field mapping support.

## Implementation Steps

- [ ] Configure Celery app and Redis broker.
- [ ] Create `ExportService`.
- [ ] Implement export job creation:
  - format
  - field mapping
  - include/exclude review metadata
- [ ] Implement worker job that queries approved/exportable submissions.
- [ ] Implement JSON writer.
- [ ] Implement JSONL writer.
- [ ] Implement CSV writer with nested JSON stringification.
- [ ] Implement Excel writer with primary sheet and optional review metadata sheet.
- [ ] Store generated files under local storage path for MVP.
- [ ] Add secure download endpoint that checks owner/reviewer permission.
- [ ] Update export job status: `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`.

## Required Tests

- JSON export contains approved submissions only.
- JSONL output has one record per line.
- CSV output contains configured renamed columns.
- Excel export creates workbook with expected sheet.
- Download denied for unauthorized user.
- Failed export records error message and status.

## Verification Commands

```bash
cd backend && pytest tests/test_exports.py tests/test_export_worker.py
```

## Handoff Requirements

Report:

- storage path
- generated file naming scheme
- export format examples
- worker command
- permission behavior

