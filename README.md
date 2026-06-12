# Telegram Archiver

Локальный архиватор личных переписок Telegram.

Приложение синхронизирует историю и новые события через Telethon, хранит сообщения в SQLite, индексирует текст через FTS5 и отдает веб-интерфейс через FastAPI.

## Возможности

- Защита чатов от потери: приложение сохраняет локальную копию переписок, даже если чат будет удален в Telegram
- Защита сообщений от удаления: удаленные сообщения остаются доступны в локальном архиве
- Сохранение истории редактирования сообщений
- Защита медиафайлов от удаления: загруженные вложения сохраняются локально
- Просмотр сообщений без отправки в Telegram отметки о прочтении
- Поиск по архиву сообщений
- Веб-интерфейс для просмотра чатов, контактов и истории

## Запуск через Docker

```bash
docker-compose up --build
```

После запуска откройте:

```text
http://localhost:8085
```

## Первый вход

Если Telegram client еще не настроен, приложение покажет форму входа.

Создайте приложение на [my.telegram.org/apps](https://my.telegram.org/apps), затем введите:

- `api_id`
- `api_hash`
- номер телефона
- код из Telegram
- пароль 2FA, если включен

После успешного входа синхронизация истории запустится автоматически.

## Локальный запуск

```bash
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
python -m app.main
```

Интерфейс будет доступен на:

```text
http://localhost:8080
```

## CLI-авторизация

Если нужно авторизоваться без веб-интерфейса:

```bash
docker-compose run --rm -it app python -m app.auth
```

Локально:

```bash
python -m app.auth
```

## Конфигурация

Настройки по умолчанию лежат в `data/config.json`:

```json
{
  "sync": {
    "photos": true,
    "photo_size": "original"
  }
}
```

## API

- `GET /api/chats`
- `GET /api/chats/{chat_id}/messages?offset=0&limit=50`
- `GET /api/search?q=текст`
- `GET /media/{path}`
