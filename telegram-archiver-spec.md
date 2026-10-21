# Telegram Archiver — Technical specification

[English](telegram-archiver-spec.md) · [Русский](telegram-archiver-spec.ru.md)

## Overview

A local archive of private Telegram chats. It stores messages and photos in a
local database and provides a browser interface for reading them. Sending
messages is not supported.

**Target environment:** Windows + WSL2 / a Linux server, run with Docker Compose.

---

## Stack

| Layer | Technology |
|---|---|
| Telegram API | [Telethon](https://github.com/LonamiWebs/Telethon) (MTProto, Python) |
| Database | SQLite with the FTS5 extension |
| Backend API | FastAPI (Python, async) |
| Frontend | React or Svelte (SPA) |
| Packaging | Docker Compose |

### Why Telethon, not Pyrogram

The original Pyrogram is officially abandoned (docs.pyrogram.org says
"The project is no longer maintained or supported"). Existing forks
(pyrotgfork, pyrofork) are alive, but their future is unclear. Telethon is the
original library, with a long history and active maintenance.

---

## Architecture

```
┌──────────────────────────────────────────┐
│              Docker Compose              │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │           Python service            │ │
│  │                                     │ │
│  │  ┌─────────────┐  ┌──────────────┐  │ │
│  │  │  Sync       │  │  FastAPI     │  │◄──── Browser
│  │  │  (Telethon) │  │  Web + API   │  │ │
│  │  └──────┬──────┘  └──────┬───────┘  │ │
│  │         │                │          │ │
│  │  ┌──────▼────────────────▼───────┐  │ │
│  │  │   SQLite  +  /media/photos    │  │ │
│  │  └───────────────────────────────┘  │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

The sync service and FastAPI run in one Python process on one asyncio event loop.
That fits Telethon, which is itself an async library.

---

## File layout

```
telegram-archiver/
├── docker-compose.yml
├── Dockerfile
├── app/
│   ├── main.py                 # Entry point, FastAPI + sync
│   ├── sync/
│   │   ├── historical.py       # Initial history download
│   │   └── live.py             # Live sync through events
│   ├── db/
│   │   ├── connection.py       # SQLite connection
│   │   ├── schema.py           # Table creation
│   │   └── queries.py          # CRUD queries
│   ├── api/
│   │   └── routes.py           # FastAPI endpoints
│   └── frontend/               # Built React/Svelte SPA
└── data/                       # Mounted as a volume
    ├── messages.db
    └── media/
        └── {chat_id}/
            └── {message_id}_{filename}.jpg
```

---

## Database schema

```sql
CREATE TABLE chats (
    id          INTEGER PRIMARY KEY,   -- Telegram chat ID
    title       TEXT NOT NULL,
    username    TEXT,
    synced_at   INTEGER                -- Unix timestamp of the last sync
);

CREATE TABLE contacts (
    id          INTEGER PRIMARY KEY,   -- Telegram user ID
    first_name  TEXT,
    last_name   TEXT,
    username    TEXT,
    phone       TEXT
);

CREATE TABLE messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id   INTEGER NOT NULL,
    chat_id       INTEGER NOT NULL,
    sender_id     INTEGER,
    text          TEXT,
    date          INTEGER NOT NULL,    -- Unix timestamp
    is_edited     BOOLEAN DEFAULT FALSE,
    edit_date     INTEGER,             -- Unix timestamp, NULL if never edited
    is_deleted    BOOLEAN DEFAULT FALSE,
    photo_path    TEXT,                -- Relative path, NULL when there is no photo
    UNIQUE(telegram_id, chat_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (sender_id) REFERENCES contacts(id)
);

-- Full-text search
CREATE VIRTUAL TABLE messages_fts
    USING fts5(text, content=messages, content_rowid=id);

-- Triggers that keep FTS up to date
CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text);
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;
```

**Indexes:**

```sql
CREATE INDEX idx_messages_chat_date ON messages(chat_id, date DESC);
CREATE INDEX idx_messages_chat_telegram ON messages(chat_id, telegram_id);
```

---

## Sync behavior

The user creates the Telegram client in the startup form. `api_id` and `api_hash`
are stored locally in `data/telegram_client.json`. The session file is stored in
`data/session.session`.

### Historical sync

Runs at startup. Iterates only private dialogs (`dialog.is_user == True`).

Algorithm for each chat:

```
1. SELECT MAX(telegram_id) FROM messages WHERE chat_id = ?
   → last_id (NULL if the chat is new)

2. client.iter_messages(chat, offset_id=last_id or 0)
   → walk from newest to oldest until last_id

3. For each message:
   a. INSERT OR IGNORE INTO messages (...)
   b. If message.photo → download the original and store the path
   c. Log progress to the console

4. UPDATE chats SET synced_at = now() WHERE id = ?
```

**FloodWaitError handling (required):**

```python
from telethon.errors import FloodWaitError
import asyncio

try:
    async for message in client.iter_messages(chat):
        ...
except FloodWaitError as e:
    print(f"FloodWait: sleeping {e.seconds} seconds")
    await asyncio.sleep(e.seconds + 5)
    # continue from the same place
```

**Console progress:**

```
[Sync] Ivan Ivanov: 1500 / ~3200 messages...
[Sync] Maria Sidorova: done (842 messages, 34 photos)
[Sync] Historical sync finished in 4m 23s
```

### Live sync

Runs alongside historical sync and the API server.
It watches private chats only.

**Three event handlers:**

```python
# New message
@client.on(events.NewMessage(func=lambda e: e.is_private))
async def on_new(event):
    # INSERT OR IGNORE INTO messages

# Edit
@client.on(events.MessageEdited(func=lambda e: e.is_private))
async def on_edit(event):
    # UPDATE messages SET text=?, is_edited=TRUE, edit_date=?
    # WHERE telegram_id=? AND chat_id=?

# Deletion
@client.on(events.MessageDeleted())
async def on_delete(event):
    # UPDATE messages SET is_deleted=TRUE
    # WHERE telegram_id IN (event.deleted_ids)
    # NOTE: event.chat_id may be None — match on telegram_id only
```

> **Important:** `MessageDeleted` does not always include `chat_id`. The same
> `telegram_id` can exist in different chats. If `chat_id` is missing, mark every
> row with that `telegram_id`, or ignore the event (acceptable).

---

## Photo storage

Only photos are downloaded (`message.photo`). Other media (video, documents,
voice messages, and so on) are not downloaded.

The **original size** is downloaded (the largest available `PhotoSize`).

**File path:**

```
data/media/{chat_id}/{telegram_message_id}.jpg
```

**Database value:**

```
photo_path = "media/123456789/-1001234567/42.jpg"
```

The path is stored relative to the data directory, so it does not depend on
where the volume is mounted.

---

## API (FastAPI)

The minimum set of endpoints for the frontend:

```
GET  /api/chats                  — list of all chats
GET  /api/chats/{id}/messages    — chat messages (pagination: ?offset=0&limit=50)
GET  /api/search?q=text          — full-text search through FTS5
GET  /media/{path}               — serve photo files
GET  /                           — SPA (index.html)
```

---

## Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data   # Database and photos persist
    restart: unless-stopped
```

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
COPY app/frontend/ ./app/frontend/
CMD ["python", "-m", "app.main"]
```

---

## Security notes

**The session file (`data/*.session`)** contains authorization for the Telegram
account. Treat it like a password: do not commit it, and back it up separately.

**`.gitignore` must include:**

```
data/*
!data/
*.session
```

**API credentials** (`api_id`, `api_hash`) come from [my.telegram.org](https://my.telegram.org).
On the first launch Telethon asks for the phone number and the confirmation code
in the console.

---

## First launch

```bash
# Clone the repo
docker compose up

# The console asks:
# Enter phone number: +7XXXXXXXXXX
# Enter code: 12345
# The session is then stored in data/ and sign-in is not required again
```
