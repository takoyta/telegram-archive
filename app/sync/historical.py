import asyncio
import time
from pathlib import Path

from telethon import TelegramClient
from telethon.errors import FloodWaitError
from telethon.tl.types import User

from app.db.connection import Database
from app.db.queries import (
    get_last_telegram_id,
    list_unchecked_telegram_ids,
    mark_chat_synced,
    mark_telegram_ids_media_checked,
)
from app.events import EventBroker
from app.sync.common import (
    is_private_human_user,
    save_message,
    save_private_chat,
    sync_user_avatars,
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


def message_batches(telegram_ids: list[int], size: int = 100):
    for start in range(0, len(telegram_ids), size):
        yield telegram_ids[start:start + size]


async def sync_new_messages(
    client: TelegramClient,
    db: Database,
    user: User,
    chat_id: int,
    title: str,
    data_dir: Path,
    download_photos: bool,
    events: EventBroker,
    min_id: int,
) -> tuple[int, int]:
    max_id = 0
    message_count = 0
    media_count = 0

    while True:
        try:
            async for message in client.iter_messages(user, min_id=min_id, max_id=max_id):
                media_path = await save_message(
                    client,
                    db,
                    message,
                    chat_id,
                    data_dir,
                    download_photos,
                )
                if message.id is not None:
                    max_id = message.id
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
            return message_count, media_count
        except FloodWaitError as error:
            print(f"[Sync] FloodWait: sleeping {error.seconds} seconds")
            await asyncio.sleep(error.seconds + 5)


async def backfill_unchecked_media(
    client: TelegramClient,
    db: Database,
    user: User,
    chat_id: int,
    title: str,
    data_dir: Path,
    download_photos: bool,
) -> tuple[int, int]:
    telegram_ids = await list_unchecked_telegram_ids(db, chat_id)
    if not telegram_ids:
        return 0, 0

    print(f"[Sync] {title}: checking media for {len(telegram_ids)} saved messages")
    seen: set[int] = set()
    message_count = 0
    media_count = 0

    for batch in message_batches(telegram_ids):
        while True:
            try:
                async for message in client.iter_messages(user, ids=batch):
                    if message is None or message.id is None or message.id in seen:
                        continue
                    media_path = await save_message(
                        client,
                        db,
                        message,
                        chat_id,
                        data_dir,
                        download_photos,
                    )
                    seen.add(message.id)
                    message_count += 1
                    media_count += int(media_path is not None)
                break
            except FloodWaitError as error:
                print(f"[Sync] FloodWait: sleeping {error.seconds} seconds")
                await asyncio.sleep(error.seconds + 5)
        await mark_telegram_ids_media_checked(db, chat_id, batch)

    return message_count, media_count


async def sync_dialog(
    client: TelegramClient,
    db: Database,
    user: User,
    data_dir: Path,
    download_photos: bool,
    events: EventBroker,
) -> tuple[int, int]:
    await save_private_chat(db, user, client, data_dir)
    try:
        await sync_user_avatars(client, db, user, data_dir)
    except Exception as error:
        print(f"[Sync] Avatars sync failed for {user.id}: {error}")

    chat_id = user.id
    title = user_log_name(user)
    last_id = await get_last_telegram_id(db, chat_id)
    await events.publish("chat_sync_started", chat_id=chat_id, title=title)

    message_count, media_count = await sync_new_messages(
        client,
        db,
        user,
        chat_id,
        title,
        data_dir,
        download_photos,
        events,
        last_id or 0,
    )
    backfill_messages, backfill_media = await backfill_unchecked_media(
        client,
        db,
        user,
        chat_id,
        title,
        data_dir,
        download_photos,
    )
    message_count += backfill_messages
    media_count += backfill_media

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
