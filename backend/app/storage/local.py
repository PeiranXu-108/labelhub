from pathlib import Path
from uuid import uuid4


class LocalExportStorage:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)

    def export_path(self, *, task_id: str, job_id: str, extension: str) -> Path:
        directory = self.root / task_id
        directory.mkdir(parents=True, exist_ok=True)
        return directory / f"task-{task_id}-export-{job_id}.{extension}"


class LocalUploadStorage:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)

    def write_asset(
        self,
        *,
        task_id: str,
        assignment_id: str | None,
        asset_id: str,
        filename: str,
        content: bytes,
    ) -> Path:
        suffix = Path(filename).suffix.lower()
        stored_filename = f"{asset_id}{suffix}" if suffix else f"{asset_id}-{uuid4().hex}"
        directory = self.root / task_id / (assignment_id or "unassigned")
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / stored_filename
        path.write_bytes(content)
        return path
