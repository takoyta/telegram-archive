import asyncio
import time
from pathlib import Path

from telethon import TelegramClient
from telethon.errors import FloodWaitError
from telethon.tl.types import User

from app.db.connection import Database
from app.db.queries import (
    get_last_telegram_id,
    has_unchecked_media,
    mark_chat_media_checked,
    mark_chat_synced,
)
from app.events import EventBroker
from app.sync.common import (
    is_private_human_user,
    save_message,
    save_private_chat,
    user_log_name,
)


async def run_historical_sync(
    client: TelegramClient,
    db: Database,
    data_dir: Path,
    download_photos: bool,
    events: EventBroker,
) -> None:
    started_at = time.monotonic()
    total_messages = 0
    total_media = 0

    print("[Sync] Historical sync started")
    await events.publish("sync_started")

    async for dialog in client.iter_dialogs():
        if not dialog.is_user or not isinstance(dialog.entity, User):
            continue

        user = await client.get_entity(dialog.entity)
        if not isinstance(user, User):
            continue
        if not is_private_human_user(user):
            title = user_log_name(user)
            print(f"[Sync] Skipping bot: {title}")
            continue

        message_count, media_count = await sync_dialog(
            client,
            db,
            user,
            data_dir,
            download_photos,
            events,
        )
        total_messages += message_count
        total_media += media_count

    elapsed = int(time.monotonic() - started_at)
    print(
        "[Sync] Historical sync finished in "
        f"{elapsed // 60}m {elapsed % 60}s "
        f"({total_messages} messages, {total_media} media)"
    )
    await events.publish(
        "sync_finished",
        messages=total_messages,
        media=total_media,
        elapsed=elapsed,
    )


async def sync_dialog(
    client: TelegramClient,
    db: Database,
    user: User,
    data_dir: Path,
    download_photos: bool,
    events: EventBroker,
) -> tuple[int, int]:
    await save_private_chat(db, user, client, data_dir)

    chat_id = user.id
    title = user_log_name(user)
    last_id = await get_last_telegram_id(db, chat_id)
    backfill_media = await has_unchecked_media(db, chat_id)
    min_id = 0 if backfill_media else last_id or 0
    message_count = 0
    media_count = 0

    if backfill_media:
        print(f"[Sync] {title}: backfilling media...")

    await events.publish("chat_sync_started", chat_id=chat_id, title=title)

    while True:
        try:
            async for message in client.iter_messages(user, min_id=min_id):
                media_path = await save_message(
                    client,
                    db,
                    message,
                    chat_id,
                    data_dir,
                    download_photos,
                )
                message_count += 1
                media_count += int(media_path is not None)

                if message_count % 500 == 0:
                    print(f"[Sync] {title}: {message_count} messages...")
                    await events.publish(
                        "sync_progress",
                        chat_id=chat_id,
                        title=title,
                        messages=message_count,
                        media=media_count,
                    )

            break
        except FloodWaitError as error:
            print(f"[Sync] FloodWait: sleeping {error.seconds} seconds")
            await asyncio.sleep(error.seconds + 5)

    if backfill_media:
        await mark_chat_media_checked(db, chat_id)

    await mark_chat_synced(db, chat_id, int(time.time()))
    print(f"[Sync] {title}: done ({message_count} messages, {media_count} media)")
    await events.publish(
        "chat_synced",
        chat_id=chat_id,
        title=title,
        messages=message_count,
        media=media_count,
    )
    return message_count, media_count
