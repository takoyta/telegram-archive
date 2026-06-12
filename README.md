# Telegram Archiver

Локальный архиватор личных переписок Telegram: Telethon синхронизирует историю и live-события, FastAPI отдает API и SPA, SQLite хранит сообщения и FTS5-индекс.

## Статус проекта

Проект предназначен для локального запуска. Данные Telegram, session-файлы, SQLite-база и локальный `config.yml` не должны попадать в репозиторий.

## Настройка

1. При необходимости скопируйте конфиг синхронизации:

```bash
cp config.example.yml config.yml
```

2. Запустите приложение и откройте форму входа. `api_id`, `api_hash` и номер телефона вводятся в браузере.

## Первый вход в Telegram

Запустите сервис:

```bash
docker-compose up --build
```

Откройте интерфейс:

```text
http://localhost:8085
```

Если Telegram client еще не настроен, появится форма входа. Создайте приложение на [my.telegram.org/apps](https://my.telegram.org/apps), затем введите:

- `api_id`
- `api_hash`
- номер телефона (`+79991234567`)
- код из Telegram
- пароль 2FA, если двухфакторная защита включена

После успешного входа historical sync запустится автоматически. Client credentials сохранятся в `data/telegram_client.json`, session сохранится в `data/session.session`.

`data/session.session` дает доступ к Telegram-аккаунту, храните его как пароль и не публикуйте. `data/telegram_client.json` тоже не стоит коммитить.

CLI-авторизация осталась как запасной вариант:

```bash
docker-compose run --rm -it app python -m app.auth
```

Если после изменения кода контейнер не видит новый модуль, пересоберите image:

```bash
docker-compose build --no-cache app
```

Локально без Docker:

```bash
python -m app.auth
```

## Запуск

```bash
docker-compose up --build
```

Интерфейс: http://localhost:8085 (порт смотри в `docker-compose.yml`)

## Локальный запуск без Docker

```bash
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
cp config.example.yml config.yml  # optional
python -m app.main
```

## API

- `GET /api/chats`
- `GET /api/chats/{chat_id}/messages?offset=0&limit=50`
- `GET /api/search?q=текст`
- `GET /media/{path}`

## Проверка перед публикацией

```bash
python -m compileall app
python -m pip check
docker-compose config
```

Перед первым пушем проверьте, что в Git не попали `data/`, `.venv/`, `config.yml`, `*.session`, `*.db`, `.env*` и другие локальные файлы. Для публичного репозитория добавьте лицензию, если хотите явно разрешить использование кода.
