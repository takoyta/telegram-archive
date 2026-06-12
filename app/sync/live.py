import time
from datetime import datetime
from pathlib import Path
from typing import Any

from telethon import TelegramClient, events
from telethon.tl.types import User

from app.db.connection import Database
from app.db.queries import (
    get_message_log_entries,
    mark_message_edited,
    mark_messages_deleted,
)
from app.sync.common import (
    contact_log_name,
    is_private_human_user,
    save_message,
    save_private_chat,
    user_log_name,
)


def register_live_sync(
    client: TelegramClient,
    db: Database,
    data_dir: Path,
    download_photos: bool,
) -> None:
    @client.on(events.NewMessage(func=lambda event: event.is_private))
    async def on_new(event: events.NewMessage.Event) -> None:
        chat = await event.get_chat()
        if not isinstance(chat, User) or not is_private_human_user(chat):
            return

        await save_private_chat(db, chat, client, data_dir)
        await save_message(client, db, event.message, chat.id, data_dir, download_photos)
        sender = await event.get_sender()
        sender_user = sender if isinstance(sender, User) else None
        print(
            f"[Live] New message {chat.id}/{event.message.id} "
            f"from {user_log_name(sender_user)}"
        )

    @client.on(events.MessageEdited(func=lambda event: event.is_private))
    async def on_edit(event: events.MessageEdited.Event) -> None:
        chat = await event.get_chat()
        if not isinstance(chat, User) or not is_private_human_user(chat):
            return

        await save_private_chat(db, chat, client, data_dir)
        edit_date = event.message.edit_date
        edit_timestamp = int(edit_date.timestamp()) if edit_date else int(time.time())
        await mark_message_edited(
            db,
            telegram_id=event.message.id,
            chat_id=chat.id,
            text=event.message.message or None,
            edit_date=edit_timestamp,
        )
        sender = await event.get_sender()
        sender_user = sender if isinstance(sender, User) else None
        print(
            f"[Live] Edited message {chat.id}/{event.message.id} "
            f"from {user_log_name(sender_user)} at {format_log_time(edit_timestamp)}"
        )

    @client.on(events.MessageDeleted())
    async def on_delete(event: events.MessageDeleted.Event) -> None:
        chat_id = event.chat_id if isinstance(event.chat_id, int) else None
        deleted_at = int(time.time())
        entries = await get_message_log_entries(db, list(event.deleted_ids), chat_id)
        await mark_messages_deleted(db, list(event.deleted_ids), chat_id, deleted_at)
        deleted = format_deleted_messages(event.deleted_ids, entries)
        print(f"[Live] Deleted messages {deleted} at {format_log_time(deleted_at)}")


def format_deleted_messages(message_ids: list[int], entries: list[dict[str, Any]]) -> str:
    if not entries:
        return str(message_ids)

    logged_ids = {entry["telegram_id"] for entry in entries}
    parts = [
        f"{entry['chat_id']}/{entry['telegram_id']} from {format_entry_sender(entry)}"
        for entry in entries
    ]
    missing_ids = [message_id for message_id in message_ids if message_id not in logged_ids]
    if missing_ids:
        parts.append(f"unknown {missing_ids}")
    return "; ".join(parts)


def format_entry_sender(entry: dict[str, Any]) -> str:
    return contact_log_name(
        entry["sender_id"],
        entry["sender_first_name"],
        entry["sender_last_name"],
        entry["sender_username"],
    )


def format_log_time(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")
