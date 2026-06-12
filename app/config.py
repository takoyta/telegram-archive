from dataclasses import dataclass
import json
from pathlib import Path


@dataclass(frozen=True)
class SyncConfig:
    photos: bool = True
    photo_size: str = "original"


@dataclass(frozen=True)
class AppConfig:
    sync: SyncConfig


def load_config(path: Path) -> AppConfig:
    raw = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    raw = raw or {}
    sync = raw.get("sync") or {}

    return AppConfig(
        sync=SyncConfig(
            photos=bool(sync.get("photos", True)),
            photo_size=str(sync.get("photo_size", "original")),
        ),
    )
