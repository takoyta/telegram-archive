SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    username TEXT,
    synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    phone TEXT,
    about TEXT,
    avatar_path TEXT,
    avatar_photo_id INTEGER,
    access_hash INTEGER,
    is_contact INTEGER,
    is_mutual_contact INTEGER,
    is_premium INTEGER,
    is_verified INTEGER,
    is_scam INTEGER,
    is_fake INTEGER,
    is_deleted INTEGER,
    is_restricted INTEGER,
    lang_code TEXT,
    status TEXT,
    last_seen_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    sender_id INTEGER,
    text TEXT,
    date INTEGER NOT NULL,
    is_edited INTEGER DEFAULT 0,
    edit_date INTEGER,
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    photo_path TEXT,
    media_path TEXT,
    media_type TEXT,
    media_checked INTEGER DEFAULT 0,
    UNIQUE(telegram_id, chat_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (sender_id) REFERENCES contacts(id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
USING fts5(text, content='messages', content_rowid='id');

CREATE TRIGGER IF NOT EXISTS messages_fts_insert
AFTER INSERT ON messages
BEGIN
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update
AFTER UPDATE ON messages
BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text)
    VALUES ('delete', old.id, old.text);
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete
AFTER DELETE ON messages
BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text)
    VALUES ('delete', old.id, old.text);
END;

CREATE INDEX IF NOT EXISTS idx_messages_chat_date
ON messages(chat_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_messages_chat_telegram
ON messages(chat_id, telegram_id);

CREATE INDEX IF NOT EXISTS idx_messages_telegram
ON messages(telegram_id);

CREATE TABLE IF NOT EXISTS message_edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    previous_text TEXT,
    new_text TEXT,
    edited_at INTEGER,
    captured_at INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE INDEX IF NOT EXISTS idx_message_edits_message_edited
ON message_edits(message_id, edited_at);
"""
