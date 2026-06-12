import json
from dataclasses import dataclass
from pathlib import Path

from telethon import TelegramClient


@dataclass(frozen=True)
class TelegramClientCredentials:
    api_id: int
    api_hash: str


def client_config_path(data_dir: Path) -> Path:
    return data_dir / "telegram_client.json"


def load_client_credentials(data_dir: Path) -> TelegramClientCredentials | None:
    path = client_config_path(data_dir)
    if not path.exists():
        return None

    raw = json.loads(path.read_text(encoding="utf-8"))
    api_id = raw.get("api_id")
    api_hash = raw.get("api_hash")
    if not api_id or not api_hash:
        return None
    return TelegramClientCredentials(api_id=int(api_id), api_hash=str(api_hash))


def save_client_credentials(
    data_dir: Path,
    api_id: int,
    api_hash: str,
) -> TelegramClientCredentials:
    credentials = TelegramClientCredentials(api_id=int(api_id), api_hash=api_hash.strip())
    data_dir.mkdir(parents=True, exist_ok=True)
    client_config_path(data_dir).write_text(
        json.dumps(
            {"api_id": credentials.api_id, "api_hash": credentials.api_hash},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return credentials


def create_client(credentials: TelegramClientCredentials, data_dir: Path) -> TelegramClient:
    return TelegramClient(
        str(data_dir / "session"),
        credentials.api_id,
        credentials.api_hash,
    )


def session_path(data_dir: Path) -> Path:
    return data_dir / "session.session"


async def connect_authorized_client(client: TelegramClient, data_dir: Path) -> bool:
    if not session_path(data_dir).exists():
        return False
    await client.connect()
    return await client.is_user_authorized()
