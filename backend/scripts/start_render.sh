#!/bin/sh
set -eu

alembic upgrade head

if [ "${LABELHUB_SEED_DEMO_USERS:-}" = "true" ]; then
  python scripts/seed_e2e_data.py demo-users
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
