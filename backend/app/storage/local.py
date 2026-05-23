from pathlib import Path


class LocalExportStorage:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)

    def export_path(self, *, task_id: str, job_id: str, extension: str) -> Path:
        directory = self.root / task_id
        directory.mkdir(parents=True, exist_ok=True)
        return directory / f"task-{task_id}-export-{job_id}.{extension}"
