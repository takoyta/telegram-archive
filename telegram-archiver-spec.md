# Telegram Archiver — Техническая спецификация

## Обзор проекта

Локальный архиватор личных переписок Telegram. Сохраняет сообщения и фотографии
в локальную БД и предоставляет браузерный интерфейс для просмотра. Отправка
сообщений не предусмотрена.

**Целевая среда:** Windows + WSL2 / Linux-сервер, запуск через Docker Compose.

---

## Стек технологий

| Слой | Технология |
|---|---|
| Telegram API | [Telethon](https://github.com/LonamiWebs/Telethon) (MTProto, Python) |
| База данных | SQLite с расширением FTS5 |
| Backend API | FastAPI (Python, async) |
| Frontend | React или Svelte (SPA) |
| Упаковка | Docker Compose |

### Почему Telethon, а не Pyrogram

Оригинальный Pyrogram официально заброшен (на docs.pyrogram.org написано
«The project is no longer maintained or supported»). Существующие форки
(pyrotgfork, pyrofork) живые, но с неизвестным будущим. Telethon — оригинальная
библиотека с долгой историей и активной поддержкой.

---

## Архитектура

```
┌──────────────────────────────────────────┐
│              Docker Compose              │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │           Python-сервис             │ │
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

Sync-сервис и FastAPI работают в одном Python-процессе на одном asyncio event loop.
Это естественно для Telethon, который сам является async-библиотекой.

---

## Структура файлов

```
telegram-archiver/
├── docker-compose.yml
├── Dockerfile
├── data/
│   └── config.json             # Настройки по умолчанию
├── app/
│   ├── main.py                 # Точка входа, запуск FastAPI + sync
│   ├── sync/
│   │   ├── historical.py       # Первичная закачка истории
│   │   └── live.py             # Live sync через events
│   ├── db/
│   │   ├── connection.py       # Подключение к SQLite
│   │   ├── schema.py           # Создание таблиц
│   │   └── queries.py          # CRUD-запросы
│   ├── api/
│   │   └── routes.py           # FastAPI endpoints
│   └── frontend/               # Собранный React/Svelte SPA
└── data/                       # Монтируется как volume
    ├── messages.db
    └── media/
        └── {chat_id}/
            └── {message_id}_{filename}.jpg
```

---

## Схема базы данных

```sql
CREATE TABLE chats (
    id          INTEGER PRIMARY KEY,   -- Telegram chat ID
    title       TEXT NOT NULL,
    username    TEXT,
    synced_at   INTEGER                -- Unix timestamp последнего синка
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
    edit_date     INTEGER,             -- Unix timestamp, NULL если не редактировалось
    is_deleted    BOOLEAN DEFAULT FALSE,
    photo_path    TEXT,                -- Относительный путь, NULL если фото нет
    UNIQUE(telegram_id, chat_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (sender_id) REFERENCES contacts(id)
);

-- Полнотекстовый поиск
CREATE VIRTUAL TABLE messages_fts
    USING fts5(text, content=messages, content_rowid=id);

-- Триггеры для поддержания FTS в актуальном состоянии
CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text);
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;
```

**Индексы:**

```sql
CREATE INDEX idx_messages_chat_date ON messages(chat_id, date DESC);
CREATE INDEX idx_messages_chat_telegram ON messages(chat_id, telegram_id);
```

---

## Логика синхронизации

### Конфиг (`data/config.json`)

```json
{
  "sync": {
    "photos": true,
    "photo_size": "original"
  }
}
```

Telegram client создается пользователем в стартовой форме. `api_id` и `api_hash` сохраняются локально в `data/telegram_client.json`, session-файл хранится в `data/session.session`.

### Historical sync

Запускается при старте. Итерирует только диалоги типа «личка» (`dialog.is_user == True`).

Алгоритм для каждого чата:

```
1. SELECT MAX(telegram_id) FROM messages WHERE chat_id = ?
   → last_id (NULL если чат новый)

2. client.iter_messages(chat, offset_id=last_id или 0)
   → итерируем от новых к старым, пока не дойдём до last_id

3. Для каждого сообщения:
   a. INSERT OR IGNORE INTO messages (...)
   b. Если message.photo → скачать оригинал, сохранить путь
   c. Лог прогресса в консоль

4. UPDATE chats SET synced_at = now() WHERE id = ?
```

**Обработка FloodWaitError (обязательно):**

```python
from telethon.errors import FloodWaitError
import asyncio

try:
    async for message in client.iter_messages(chat):
        ...
except FloodWaitError as e:
    print(f"FloodWait: ждём {e.seconds} секунд")
    await asyncio.sleep(e.seconds + 5)
    # продолжить с того же места
```

**Прогресс в консоль:**

```
[Sync] Иван Иванов: 1500 / ~3200 сообщений...
[Sync] Мария Сидорова: готово (842 сообщения, 34 фото)
[Sync] Исторический синк завершён за 4м 23с
```

### Live sync

Запускается параллельно с historical sync и API-сервером.
Отслеживает только личные чаты.

**Три обработчика событий:**

```python
# Новое сообщение
@client.on(events.NewMessage(func=lambda e: e.is_private))
async def on_new(event):
    # INSERT OR IGNORE INTO messages

# Редактирование
@client.on(events.MessageEdited(func=lambda e: e.is_private))
async def on_edit(event):
    # UPDATE messages SET text=?, is_edited=TRUE, edit_date=?
    # WHERE telegram_id=? AND chat_id=?

# Удаление
@client.on(events.MessageDeleted())
async def on_delete(event):
    # UPDATE messages SET is_deleted=TRUE
    # WHERE telegram_id IN (event.deleted_ids)
    # ВНИМАНИЕ: event.chat_id может быть None — искать только по telegram_id
```

> **Важно:** `MessageDeleted` не всегда содержит `chat_id`. Поле `telegram_id`
> в разных чатах может совпадать. Если `chat_id` отсутствует — помечать все
> записи с данным `telegram_id`, либо игнорировать событие (приемлемо).

---

## Хранение фотографий

Скачиваются только фотографии (`message.photo`). Остальные медиафайлы (видео,
документы, голосовые и т.д.) не загружаются.

Скачивается **оригинальный размер** (наибольший доступный `PhotoSize`).

**Путь к файлу:**

```
data/media/{chat_id}/{telegram_message_id}.jpg
```

**Запись в БД:**

```
photo_path = "media/123456789/-1001234567/42.jpg"
```

Путь хранится относительным — чтобы не зависеть от места монтирования тома.

---

## API (FastAPI)

Минимальный набор эндпоинтов для фронтенда:

```
GET  /api/chats                  — список всех чатов
GET  /api/chats/{id}/messages    — сообщения чата (пагинация: ?offset=0&limit=50)
GET  /api/search?q=текст         — полнотекстовый поиск по FTS5
GET  /media/{path}               — отдача файлов фотографий
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
      - ./data:/app/data   # БД и фото персистентны
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

## Безопасность и важные замечания

**Session-файл (`data/*.session`)** — содержит авторизацию в аккаунт Telegram.
Обращаться как с паролем: не коммитить в git, бэкапить отдельно.

**`.gitignore` обязательно должен включать:**

```
data/*
!data/
!data/config.json
*.session
```

**API credentials** (`api_id`, `api_hash`) получить на [my.telegram.org](https://my.telegram.org).
При первом запуске Telethon запросит номер телефона и код подтверждения в консоли.

---

## Первый запуск

```bash
# Клонировать репо
docker compose up

# В консоли появится запрос:
# Enter phone number: +7XXXXXXXXXX
# Enter code: 12345
# После этого session сохранится в data/ и повторная авторизация не нужна
```
