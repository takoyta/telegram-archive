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

    def _connection(self) -> sqlite3.Connection:
        if self.connection is None:
            raise RuntimeError("Database is not connected")
        return self.connection
