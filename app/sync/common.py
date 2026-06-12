from pathlib import Path
import mimetypes
import time

from telethon import TelegramClient
from telethon.tl.functions.users import GetFullUserRequest
from telethon.tl.custom.message import Message
from telethon.tl.types import User
from telethon.utils import get_display_name

from app.db.connection import Database
from app.db.queries import upsert_chat, upsert_contact, upsert_message


def is_private_human_user(user: User) -> bool:
    return not user.bot


def user_log_name(user: User | None, fallback_id: int | None = None) -> str:
    if user is None:
        return f"id={fallback_id}" if fallback_id is not None else "unknown"

    return contact_log_name(
        user.id,
        user.first_name,
        user.last_name,
        user.username,
    )


def contact_log_name(
    contact_id: int | None,
    first_name: str | None,
    last_name: str | None,
    username: str | None,
) -> str:
    name = " ".join(part for part in (first_name, last_name) if part)
    parts = []
    if name:
        parts.append(name)
    if username:
        parts.append(f"@{username}")
    if contact_id is not None:
        parts.append(f"id={contact_id}")

    if not parts:
        return "unknown"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} ({', '.join(parts[1:])})"


async def save_user(
    db: Database,
    user: User,
    client: TelegramClient | None = None,
    data_dir: Path | None = None,
    include_full: bool = False,
) -> None:
    about = None
    if include_full and client is not None:
        about = await get_user_about(client, user)

    avatar_path = None
    avatar_photo_id = getattr(user.photo, "photo_id", None)
    if client is not None and data_dir is not None:
        avatar_path = await save_avatar(client, user, data_dir, avatar_photo_id)
        if avatar_photo_id is None:
            avatar_photo_id = 0

    await upsert_contact(
        db,
        user.id,
        user.first_name,
        user.last_name,
        user.username,
        user.phone,
        about=about,
        avatar_path=avatar_path,
        avatar_photo_id=avatar_photo_id,
        access_hash=getattr(user, "access_hash", None),
        is_contact=getattr(user, "contact", None),
        is_mutual_contact=getattr(user, "mutual_contact", None),
        is_premium=getattr(user, "premium", None),
        is_verified=getattr(user, "verified", None),
        is_scam=getattr(user, "scam", None),
        is_fake=getattr(user, "fake", None),
        is_deleted=getattr(user, "deleted", None),
        is_restricted=getattr(user, "restricted", None),
        lang_code=getattr(user, "lang_code", None),
        status=user_status(user),
        last_seen_at=user_last_seen(user),
        updated_at=int(time.time()),
    )


async def save_private_chat(
    db: Database,
    user: User,
    client: TelegramClient,
    data_dir: Path,
) -> None:
    await save_user(db, user, client, data_dir, include_full=True)
    await upsert_chat(db, user.id, get_display_name(user) or str(user.id), user.username)


async def save_message(
    client: TelegramClient,
    db: Database,
    message: Message,
    chat_id: int,
    data_dir: Path,
    download_photos: bool,
) -> str | None:
    if message.id is None or message.date is None:
        return None

    sender = await message.get_sender()
    sender_id = getattr(sender, "id", None)

    if isinstance(sender, User):
        await save_user(db, sender, client, data_dir)

    media_type = message_media_type(message)
    media_path = None
    if download_photos and media_type is not None:
        media_path = await save_media(client, message, chat_id, data_dir, media_type)

    await upsert_message(
        db,
        telegram_id=message.id,
        chat_id=chat_id,
        sender_id=sender_id,
        text=message.message or None,
        date=int(message.date.timestamp()),
        is_edited=message.edit_date is not None,
        edit_date=int(message.edit_date.timestamp()) if message.edit_date else None,
        photo_path=media_path if media_type == "image" else None,
        media_path=media_path,
        media_type=media_type if media_path else None,
    )
    return media_path


async def save_media(
    client: TelegramClient,
    message: Message,
    chat_id: int,
    data_dir: Path,
    media_type: str,
) -> str | None:
    existing = existing_media_path(data_dir, chat_id, message.id)
    if existing is not None:
        return existing.as_posix()

    relative_path = Path("media") / str(chat_id) / f"{message.id}{media_extension(message)}"
    target_path = data_dir / relative_path

    if target_path.exists():
        return relative_path.as_posix()

    target_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        await client.download_media(message, file=str(target_path))
        return relative_path.as_posix() if target_path.exists() else None
    except Exception as error:
        print(f"[Sync] Media download failed for {chat_id}/{message.id}: {error}")
        return None


def existing_media_path(data_dir: Path, chat_id: int, message_id: int) -> Path | None:
    media_dir = data_dir / "media" / str(chat_id)
    if not media_dir.exists():
        return None

    for path in media_dir.glob(f"{message_id}.*"):
        return path.relative_to(data_dir)
    return None


def message_media_type(message: Message) -> str | None:
    file = getattr(message, "file", None)
    mime_type = getattr(file, "mime_type", None) or ""

    if message.photo or mime_type.startswith("image/"):
        return "image"
    if getattr(message, "voice", None) or getattr(message, "audio", None):
        return "audio"
    if getattr(message, "video", None) or mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("audio/"):
        return "audio"
    return None


def media_extension(message: Message) -> str:
    file = getattr(message, "file", None)
    ext = getattr(file, "ext", None)
    if ext:
        return ".jpg" if ext == ".jpeg" else ext

    mime_type = getattr(file, "mime_type", None)
    guessed = mimetypes.guess_extension(mime_type or "")
    if guessed == ".jpe":
        return ".jpg"
    return guessed or ".bin"


async def repair_saved_media(db: Database, data_dir: Path) -> None:
    rows = await db.fetchall(
        """
        SELECT id, COALESCE(media_path, photo_path) AS media_path
        FROM messages
        WHERE COALESCE(media_path, photo_path) IS NOT NULL
        """
    )

    for row in rows:
        relative_path = Path(row["media_path"])
        path = data_dir / relative_path
        detected = detect_media_file(path)
        if detected is None:
            continue

        media_type, extension = detected
        new_path = path.with_suffix(extension)
        if new_path != path:
            if not new_path.exists():
                path.replace(new_path)
            if new_path.exists():
                relative_path = new_path.relative_to(data_dir)

        media_path = relative_path.as_posix()
        photo_path = media_path if media_type == "image" else None
        await db.execute(
            """
            UPDATE messages
            SET media_path = ?, media_type = ?, photo_path = ?
            WHERE id = ?
            """,
            (media_path, media_type, photo_path, row["id"]),
        )


def detect_media_file(path: Path) -> tuple[str, str] | None:
    if not path.exists() or not path.is_file():
        return None

    with path.open("rb") as file:
        header = file.read(64)
    if header.startswith(b"\xff\xd8\xff"):
        return "image", ".jpg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", ".png"
    if header.startswith(b"GIF87a") or header.startswith(b"GIF89a"):
        return "image", ".gif"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "image", ".webp"
    if header[4:8] == b"ftyp":
        return "video", ".mp4"
    if header.startswith(b"OggS"):
        return "audio", ".ogg"
    if header.startswith(b"ID3") or header[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio", ".mp3"
    if header.startswith(b"\x1aE\xdf\xa3"):
        return "video", ".webm"
    return None


async def get_user_about(client: TelegramClient, user: User) -> str | None:
    try:
        full = await client(GetFullUserRequest(user))
        return full.full_user.about or None
    except Exception as error:
        print(f"[Sync] Full user fetch failed for {user.id}: {error}")
        return None


async def save_avatar(
    client: TelegramClient,
    user: User,
    data_dir: Path,
    photo_id: int | None,
) -> str | None:
    if photo_id is None:
        return ""

    relative_path = Path("media") / "avatars" / f"{user.id}_{photo_id}.jpg"
    target_path = data_dir / relative_path
    if target_path.exists():
        return relative_path.as_posix()

    target_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        downloaded = await client.download_profile_photo(
            user,
            file=str(target_path),
            download_big=True,
        )
        return relative_path.as_posix() if downloaded else None
    except Exception as error:
        print(f"[Sync] Avatar download failed for {user.id}: {error}")
        return None


def user_status(user: User) -> str | None:
    status = getattr(user, "status", None)
    if status is None:
        return None
    return type(status).__name__.replace("UserStatus", "")


def user_last_seen(user: User) -> int | None:
    status = getattr(user, "status", None)
    was_online = getattr(status, "was_online", None)
    return int(was_online.timestamp()) if was_online is not None else None
