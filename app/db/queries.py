import re
import time
from typing import Any

from app.db.connection import Database


def row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row)


async def upsert_chat(
    db: Database,
    chat_id: int,
    title: str,
    username: str | None,
) -> None:
    await db.execute(
        """
        INSERT INTO chats(id, title, username)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            username = excluded.username
        """,
        (chat_id, title, username),
    )


async def upsert_contact(
    db: Database,
    contact_id: int,
    first_name: str | None,
    last_name: str | None,
    username: str | None,
    phone: str | None,
    about: str | None = None,
    avatar_path: str | None = None,
    avatar_photo_id: int | None = None,
    access_hash: int | None = None,
    is_contact: bool | None = None,
    is_mutual_contact: bool | None = None,
    is_premium: bool | None = None,
    is_verified: bool | None = None,
    is_scam: bool | None = None,
    is_fake: bool | None = None,
    is_deleted: bool | None = None,
    is_restricted: bool | None = None,
    lang_code: str | None = None,
    status: str | None = None,
    last_seen_at: int | None = None,
    updated_at: int | None = None,
) -> None:
    await db.execute(
        """
        INSERT INTO contacts(
            id, first_name, last_name, username, phone, about, avatar_path,
            avatar_photo_id, access_hash, is_contact, is_mutual_contact, is_premium,
            is_verified, is_scam, is_fake, is_deleted, is_restricted, lang_code,
            status, last_seen_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            username = excluded.username,
            phone = excluded.phone,
            about = COALESCE(excluded.about, contacts.about),
            avatar_path = COALESCE(excluded.avatar_path, contacts.avatar_path),
            avatar_photo_id = COALESCE(excluded.avatar_photo_id, contacts.avatar_photo_id),
            access_hash = COALESCE(excluded.access_hash, contacts.access_hash),
            is_contact = COALESCE(excluded.is_contact, contacts.is_contact),
            is_mutual_contact = COALESCE(excluded.is_mutual_contact, contacts.is_mutual_contact),
            is_premium = COALESCE(excluded.is_premium, contacts.is_premium),
            is_verified = COALESCE(excluded.is_verified, contacts.is_verified),
            is_scam = COALESCE(excluded.is_scam, contacts.is_scam),
            is_fake = COALESCE(excluded.is_fake, contacts.is_fake),
            is_deleted = COALESCE(excluded.is_deleted, contacts.is_deleted),
            is_restricted = COALESCE(excluded.is_restricted, contacts.is_restricted),
            lang_code = COALESCE(excluded.lang_code, contacts.lang_code),
            status = COALESCE(excluded.status, contacts.status),
            last_seen_at = COALESCE(excluded.last_seen_at, contacts.last_seen_at),
            updated_at = COALESCE(excluded.updated_at, contacts.updated_at)
        """,
        (
            contact_id,
            first_name,
            last_name,
            username,
            phone,
            about,
            avatar_path,
            avatar_photo_id,
            access_hash,
            int(is_contact) if is_contact is not None else None,
            int(is_mutual_contact) if is_mutual_contact is not None else None,
            int(is_premium) if is_premium is not None else None,
            int(is_verified) if is_verified is not None else None,
            int(is_scam) if is_scam is not None else None,
            int(is_fake) if is_fake is not None else None,
            int(is_deleted) if is_deleted is not None else None,
            int(is_restricted) if is_restricted is not None else None,
            lang_code,
            status,
            last_seen_at,
            updated_at,
        ),
    )


async def upsert_message(
    db: Database,
    telegram_id: int,
    chat_id: int,
    sender_id: int | None,
    text: str | None,
    date: int,
    is_edited: bool = False,
    edit_date: int | None = None,
    photo_path: str | None = None,
    media_path: str | None = None,
    media_type: str | None = None,
) -> None:
    await db.execute(
        """
        INSERT INTO messages(
            telegram_id, chat_id, sender_id, text, date, is_edited, edit_date,
            photo_path, media_path, media_type, media_checked
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(telegram_id, chat_id) DO UPDATE SET
            sender_id = excluded.sender_id,
            text = excluded.text,
            date = excluded.date,
            is_edited = excluded.is_edited,
            edit_date = excluded.edit_date,
            photo_path = COALESCE(excluded.photo_path, messages.photo_path),
            media_path = COALESCE(excluded.media_path, messages.media_path),
            media_type = COALESCE(excluded.media_type, messages.media_type),
            media_checked = 1
        """,
        (
            telegram_id,
            chat_id,
            sender_id,
            text,
            date,
            int(is_edited),
            edit_date,
            photo_path,
            media_path,
            media_type,
        ),
    )


async def mark_message_edited(
    db: Database,
    telegram_id: int,
    chat_id: int,
    text: str | None,
    edit_date: int | None,
) -> None:
    row = await db.fetchone(
        "SELECT id, text FROM messages WHERE telegram_id = ? AND chat_id = ?",
        (telegram_id, chat_id),
    )
    if row is None:
        return

    if row["text"] != text:
        await db.execute(
            """
            INSERT INTO message_edits(
                message_id, previous_text, new_text, edited_at, captured_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (row["id"], row["text"], text, edit_date, int(time.time())),
        )

    await db.execute(
        """
        UPDATE messages
        SET text = ?, is_edited = 1, edit_date = ?
        WHERE telegram_id = ? AND chat_id = ?
        """,
        (text, edit_date, telegram_id, chat_id),
    )


async def get_message_edit_histories(
    db: Database,
    message_ids: list[int],
) -> dict[int, list[dict[str, Any]]]:
    if not message_ids:
        return {}

    placeholders = ",".join("?" for _ in message_ids)
    rows = await db.fetchall(
        f"""
        SELECT message_id, previous_text, new_text, edited_at, captured_at
        FROM message_edits
        WHERE message_id IN ({placeholders})
        ORDER BY edited_at ASC, id ASC
        """,
        tuple(message_ids),
    )

    histories: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        entry = row_to_dict(row)
        message_id = entry.pop("message_id")
        histories.setdefault(message_id, []).append(entry)
    return histories


def attach_edit_histories(
    messages: list[dict[str, Any]],
    histories: dict[int, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    for message in messages:
        message["edit_history"] = histories.get(message["id"], [])
    return messages


async def mark_messages_deleted(
    db: Database,
    telegram_ids: list[int],
    chat_id: int | None = None,
    deleted_at: int | None = None,
) -> None:
    if not telegram_ids:
        return

    placeholders = ",".join("?" for _ in telegram_ids)
    params: list[Any] = [deleted_at, *telegram_ids]
    sql = f"""
        UPDATE messages
        SET is_deleted = 1, deleted_at = ?
        WHERE telegram_id IN ({placeholders})
    """

    if chat_id is not None:
        sql += " AND chat_id = ?"
        params.append(chat_id)

    await db.execute(sql, tuple(params))


async def get_message_log_entries(
    db: Database,
    telegram_ids: list[int],
    chat_id: int | None = None,
) -> list[dict[str, Any]]:
    if not telegram_ids:
        return []

    placeholders = ",".join("?" for _ in telegram_ids)
    params: list[Any] = list(telegram_ids)
    sql = f"""
        SELECT
            m.telegram_id,
            m.chat_id,
            m.sender_id,
            c.first_name AS sender_first_name,
            c.last_name AS sender_last_name,
            c.username AS sender_username
        FROM messages m
        LEFT JOIN contacts c ON c.id = m.sender_id
        WHERE m.telegram_id IN ({placeholders})
    """

    if chat_id is not None:
        sql += " AND m.chat_id = ?"
        params.append(chat_id)

    rows = await db.fetchall(sql, tuple(params))
    by_id = {row["telegram_id"]: row_to_dict(row) for row in rows}
    return [by_id[telegram_id] for telegram_id in telegram_ids if telegram_id in by_id]


async def get_last_telegram_id(db: Database, chat_id: int) -> int | None:
    row = await db.fetchone(
        "SELECT MAX(telegram_id) AS last_id FROM messages WHERE chat_id = ?",
        (chat_id,),
    )
    return row["last_id"] if row is not None else None


async def mark_chat_synced(db: Database, chat_id: int, synced_at: int) -> None:
    await db.execute(
        "UPDATE chats SET synced_at = ? WHERE id = ?",
        (synced_at, chat_id),
    )


async def has_unchecked_media(db: Database, chat_id: int) -> bool:
    row = await db.fetchone(
        """
        SELECT 1
        FROM messages
        WHERE chat_id = ? AND is_deleted = 0 AND COALESCE(media_checked, 0) = 0
        LIMIT 1
        """,
        (chat_id,),
    )
    return row is not None


async def mark_chat_media_checked(db: Database, chat_id: int) -> None:
    await db.execute(
        "UPDATE messages SET media_checked = 1 WHERE chat_id = ?",
        (chat_id,),
    )


async def list_chats(db: Database) -> list[dict[str, Any]]:
    rows = await db.fetchall(
        """
        SELECT
            c.id,
            c.title,
            c.username,
            c.synced_at,
            contacts.avatar_path,
            COUNT(m.id) AS message_count,
            SUM(CASE WHEN COALESCE(m.media_path, m.photo_path) IS NULL THEN 0 ELSE 1 END) AS photo_count,
            MAX(m.date) AS last_message_at
        FROM chats c
        LEFT JOIN contacts ON contacts.id = c.id
        LEFT JOIN messages m ON m.chat_id = c.id
        GROUP BY c.id
        ORDER BY last_message_at DESC NULLS LAST, c.title COLLATE NOCASE
        """
    )
    return [row_to_dict(row) for row in rows]


async def get_contact(db: Database, contact_id: int) -> dict[str, Any] | None:
    row = await db.fetchone(
        """
        SELECT
            contacts.*,
            chats.title AS chat_title,
            chats.synced_at,
            COUNT(messages.id) AS message_count,
            SUM(CASE WHEN COALESCE(messages.media_path, messages.photo_path) IS NULL THEN 0 ELSE 1 END) AS photo_count,
            MIN(messages.date) AS first_message_at,
            MAX(messages.date) AS last_message_at
        FROM contacts
        LEFT JOIN chats ON chats.id = contacts.id
        LEFT JOIN messages ON messages.chat_id = contacts.id
        WHERE contacts.id = ?
        GROUP BY contacts.id
        """,
        (contact_id,),
    )
    return row_to_dict(row) if row is not None else None


async def list_messages(
    db: Database,
    chat_id: int,
    offset: int,
    limit: int,
) -> list[dict[str, Any]]:
    rows = await db.fetchall(
        """
        SELECT
            m.*,
            CASE
                WHEN m.sender_id IS NOT NULL AND m.sender_id != m.chat_id THEN 1
                ELSE 0
            END AS is_outgoing,
            c.first_name AS sender_first_name,
            c.last_name AS sender_last_name,
            c.username AS sender_username
        FROM messages m
        LEFT JOIN contacts c ON c.id = m.sender_id
        WHERE m.chat_id = ?
        ORDER BY m.date DESC, m.telegram_id DESC
        LIMIT ? OFFSET ?
        """,
        (chat_id, limit, offset),
    )
    messages = [row_to_dict(row) for row in rows]
    histories = await get_message_edit_histories(db, [message["id"] for message in messages])
    return attach_edit_histories(messages, histories)


async def search_messages(
    db: Database,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    fts_query = build_fts_query(query)
    if not fts_query:
        return []

    rows = await db.fetchall(
        """
        SELECT
            m.*,
            CASE
                WHEN m.sender_id IS NOT NULL AND m.sender_id != m.chat_id THEN 1
                ELSE 0
            END AS is_outgoing,
            chats.title AS chat_title,
            contacts.first_name AS sender_first_name,
            contacts.last_name AS sender_last_name,
            contacts.username AS sender_username
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.rowid
        JOIN chats ON chats.id = m.chat_id
        LEFT JOIN contacts ON contacts.id = m.sender_id
        WHERE messages_fts MATCH ?
        ORDER BY bm25(messages_fts), m.date DESC
        LIMIT ?
        """,
        (fts_query, limit),
    )
    messages = [row_to_dict(row) for row in rows]
    histories = await get_message_edit_histories(db, [message["id"] for message in messages])
    return attach_edit_histories(messages, histories)


def build_fts_query(query: str) -> str:
    terms = re.findall(r"[\wА-Яа-яЁё]+", query, flags=re.UNICODE)
    return " ".join(f'"{term}"' for term in terms)
