#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "LabelHub production preflight"

if command -v docker >/dev/null 2>&1; then
  echo "docker: $(command -v docker)"
else
  echo "docker: missing"
  exit 1
fi

docker info >/tmp/labelhub-docker-info.txt
echo "docker daemon: reachable"

rm -f /tmp/labelhub-compose-config.yaml
env LABELHUB_LLM_API_KEY= docker compose config --quiet
echo "compose config: ok (quiet; LABELHUB_LLM_API_KEY blanked)"

for name in \
  LABELHUB_DATABASE_URL \
  LABELHUB_REDIS_URL \
  LABELHUB_JWT_SECRET_KEY \
  LABELHUB_LLM_PROVIDER \
  LABELHUB_LLM_MODEL \
  LABELHUB_LLM_BASE_URL \
  LABELHUB_LLM_TEMPERATURE
do
  if [[ -n "${!name:-}" ]]; then
    echo "$name: set"
  else
    echo "$name: unset"
  fi
done

if [[ -n "${LABELHUB_LLM_API_KEY:-}" ]]; then
  echo "LABELHUB_LLM_API_KEY: set"
else
  echo "LABELHUB_LLM_API_KEY: absent"
fi

for path in "${LABELHUB_EXPORT_STORAGE_PATH:-storage/exports}" "${LABELHUB_UPLOAD_STORAGE_PATH:-storage/uploads}"; do
  mkdir -p "$path"
  probe="$path/.labelhub-preflight"
  printf "ok" >"$probe"
  test "$(cat "$probe")" = "ok"
  rm -f "$probe"
  echo "storage: $path write/read ok"
done

if [[ "${1:-}" == "--runtime" ]]; then
  env LABELHUB_LLM_API_KEY="${LABELHUB_LLM_API_KEY:-}" docker compose up --build -d
  curl -fsS http://127.0.0.1:8000/health >/tmp/labelhub-api-health.json
  curl -fsS -o /tmp/labelhub-frontend-login.html http://127.0.0.1:5173/login
  docker compose exec -T postgres pg_isready -U labelhub -d labelhub
  docker compose exec -T redis redis-cli ping
  docker compose exec -T api alembic current
  docker compose exec -T api python - <<'PY'
from pathlib import Path
import os

for key, default in (
    ("LABELHUB_EXPORT_STORAGE_PATH", "storage/exports"),
    ("LABELHUB_UPLOAD_STORAGE_PATH", "storage/uploads"),
):
    path = Path(os.getenv(key, default))
    path.mkdir(parents=True, exist_ok=True)
    probe = path / ".labelhub-api-preflight"
    probe.write_text("ok", encoding="utf-8")
    if probe.read_text(encoding="utf-8") != "ok":
        raise SystemExit(f"{key} readback failed")
    probe.unlink()
    print(f"{key}: api write/read ok")
PY
  docker compose exec -T worker python - <<'PY'
from pathlib import Path
import os

path = Path(os.getenv("LABELHUB_EXPORT_STORAGE_PATH", "storage/exports"))
path.mkdir(parents=True, exist_ok=True)
(path / ".labelhub-worker-shared-preflight").write_text("worker-ok", encoding="utf-8")
print(f"LABELHUB_EXPORT_STORAGE_PATH: worker wrote {path}")
PY
  docker compose exec -T api python - <<'PY'
from pathlib import Path
import os

path = Path(os.getenv("LABELHUB_EXPORT_STORAGE_PATH", "storage/exports"))
probe = path / ".labelhub-worker-shared-preflight"
if probe.read_text(encoding="utf-8") != "worker-ok":
    raise SystemExit("worker export storage is not visible from api")
probe.unlink()
print("LABELHUB_EXPORT_STORAGE_PATH: api can read worker output")
PY
  docker compose exec -T worker celery -A app.workers.celery_app.celery_app inspect ping --timeout=5
  echo "runtime smoke: ok"
else
  echo "runtime smoke: skipped (pass --runtime to start Compose and run HTTP/service probes)"
fi
