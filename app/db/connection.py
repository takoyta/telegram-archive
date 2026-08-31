import asyncio
import sqlite3
from pathlib import Path
from typing import Any

from app.db.schema import SCHEMA


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.connection: sqlite3.Connection | None = None
        self.lock = asyncio.Lock()

    async def connect(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        await self.executescript(SCHEMA)
        await self.migrate()

    async def close(self) -> None:
        if self.connection is not None:
            self.connection.close()
            self.connection = None

    async def executescript(self, sql: str) -> None:
        connection = self._connection()
        async with self.lock:
            connection.executescript(sql)
            connection.commit()

    async def execute(
        self,
        sql: str,
        params: tuple[Any, ...] = (),
    ) -> sqlite3.Cursor:
        connection = self._connection()
        async with self.lock:
            cursor = connection.execute(sql, params)
            connection.commit()
            return cursor

    async def fetchone(
        self,
        sql: str,
        params: tuple[Any, ...] = (),
    ) -> sqlite3.Row | None:
        connection = self._connection()
        async with self.lock:
            cursor = connection.execute(sql, params)
            return cursor.fetchone()

    async def fetchall(
        self,
        sql: str,
        params: tuple[Any, ...] = (),
    ) -> list[sqlite3.Row]:
        connection = self._connection()
        async with self.lock:
            cursor = connection.execute(sql, params)
            return cursor.fetchall()

    async def migrate(self) -> None:
        contact_columns = {
            "about": "TEXT",
            "birthday": "TEXT",
            "avatar_path": "TEXT",
            "avatar_photo_id": "INTEGER",
            "access_hash": "INTEGER",
            "is_contact": "INTEGER",
            "is_mutual_contact": "INTEGER",
            "is_premium": "INTEGER",
            "is_verified": "INTEGER",
            "is_scam": "INTEGER",
            "is_fake": "INTEGER",
            "is_deleted": "INTEGER",
            "is_restricted": "INTEGER",
            "lang_code": "TEXT",
            "status": "TEXT",
            "last_seen_at": "INTEGER",
            "updated_at": "INTEGER",
        }
        existing = {
            row["name"]
            for row in await self.fetchall("PRAGMA table_info(contacts)")
        }

        for name, definition in contact_columns.items():
            if name not in existing:
                await self.execute(f"ALTER TABLE contacts ADD COLUMN {name} {definition}")

        message_columns = {
            "deleted_at": "INTEGER",
            "media_path": "TEXT",
            "media_type": "TEXT",
            "media_checked": "INTEGER DEFAULT 0",
        }
        existing = {
            row["name"]
            for row in await self.fetchall("PRAGMA table_info(messages)")
        }

        for name, definition in message_columns.items():
            if name not in existing:
                await self.execute(f"ALTER TABLE messages ADD COLUMN {name} {definition}")

        await self.execute(
            """
            UPDATE messages
            SET media_path = photo_path,
                media_type = 'image'
            WHERE media_path IS NULL AND photo_path IS NOT NULL
            """
        )

        await self.execute(
            """
            CREATE TABLE IF NOT EXISTS avatars (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_id INTEGER NOT NULL,
                photo_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                date INTEGER,
                is_current INTEGER DEFAULT 0,
                created_at INTEGER,
                UNIQUE(contact_id, photo_id),
                FOREIGN KEY (contact_id) REFERENCES contacts(id)
            )
            """
        )
        await self.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_avatars_contact_date
            ON avatars(contact_id, date DESC, id DESC)
            """
        )

        await self.execute(
            """
            INSERT OR IGNORE INTO avatars(contact_id, photo_id, path, is_current, created_at)
            SELECT id, COALESCE(avatar_photo_id, 0), avatar_path, 1, COALESCE(updated_at, strftime('%s', 'now'))
            FROM contacts
            WHERE avatar_path IS NOT NULL AND avatar_path != ''
            """
        )

        avatars_dir = self.path.parent / "media" / "avatars"
        if avatars_dir.exists() and avatars_dir.is_dir():
            for file_path in avatars_dir.glob("*_*.jpg"):
                parts = file_path.stem.split("_", 1)
                if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                    contact_id = int(parts[0])
                    photo_id = int(parts[1])
                    rel_path = f"media/avatars/{file_path.name}"
                    mtime = int(file_path.stat().st_mtime)
                    await self.execute(
                        """
                        INSERT OR IGNORE INTO avatars(contact_id, photo_id, path, date, is_current, created_at)
                        VALUES (?, ?, ?, ?, 0, ?)
                        """,
                        (contact_id, photo_id, rel_path, mtime, mtime),
                    )

            await self.execute(
                """
                UPDATE avatars
                SET is_current = 1
                WHERE EXISTS (
                    SELECT 1 FROM contacts
                    WHERE contacts.id = avatars.contact_id
                      AND contacts.avatar_photo_id = avatars.photo_id
                )
                """
            )

    def _connection(self) -> sqlite3.Connection:
        if self.connection is None:
            raise RuntimeError("Database is not connected")
        return self.connection
