import asyncio
import contextlib
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api.routes import router
from app.config import load_config
from app.db.connection import Database
from app.sync.common import repair_saved_media
from app.sync.historical import run_historical_sync
from app.sync.live import register_live_sync
from app.telegram_auth import connect_authorized_client, create_client, load_client_credentials


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
CONFIG_PATH = Path(os.getenv("CONFIG_PATH", BASE_DIR / "config.yml"))
FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = load_config(CONFIG_PATH)
    db = Database(DATA_DIR / "messages.db")
    await db.connect()
    await repair_saved_media(db, DATA_DIR)

    sync_task = None
    client = None
    credentials = load_client_credentials(DATA_DIR)
    if credentials is not None:
        client = create_client(credentials, DATA_DIR)
        register_live_sync(client, db, DATA_DIR, config.sync.photos)
        is_authorized = await connect_authorized_client(client, DATA_DIR)
        if is_authorized:
            sync_task = asyncio.create_task(
                run_historical_sync(client, db, DATA_DIR, config.sync.photos)
            )

    app.state.config = config
    app.state.data_dir = DATA_DIR
    app.state.db = db
    app.state.telegram_client = client
    app.state.sync_task = sync_task
    app.state.auth_phone = None
    app.state.auth_phone_code_hash = None
    app.state.sync_lock = asyncio.Lock()

    try:
        yield
    finally:
        if sync_task is not None:
            sync_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await sync_task
        if client is not None:
            await client.disconnect()
        await db.close()


app = FastAPI(title="Telegram Archiver", lifespan=lifespan)
app.include_router(router)
app.mount("/media", StaticFiles(directory=DATA_DIR / "media", check_dir=False), name="media")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080)
