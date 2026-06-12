import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from telethon.errors import (
    ApiIdInvalidError,
    ConnectionApiIdInvalidError,
    FloodWaitError,
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    PhoneNumberInvalidError,
    SessionPasswordNeededError,
)

from app.db.connection import Database
from app.db.queries import get_contact, list_chats, list_messages, search_messages
from app.sync.historical import run_historical_sync
from app.sync.live import register_live_sync
from app.telegram_auth import TelegramClientCredentials, create_client, save_client_credentials


router = APIRouter(prefix="/api")


class SendCodeRequest(BaseModel):
    phone: str
    api_id: int | None = None
    api_hash: str | None = None


class SignInRequest(BaseModel):
    code: str


class PasswordRequest(BaseModel):
    password: str


def get_db(request: Request) -> Database:
    return request.app.state.db


async def ensure_client_connected(request: Request) -> None:
    client = request.app.state.telegram_client
    if client is None:
        raise HTTPException(status_code=400, detail="Enter Telegram API ID and API hash first")
    if not client.is_connected():
        await client.connect()


async def auth_response(request: Request) -> dict[str, Any]:
    client = request.app.state.telegram_client
    authorized = False
    user = None

    if client is not None and client.is_connected():
        authorized = await client.is_user_authorized()

    if authorized and client is not None:
        me = await client.get_me()
        user = {
            "id": me.id,
            "first_name": me.first_name,
            "last_name": me.last_name,
            "username": me.username,
        }

    return {
        "authorized": authorized,
        "client_configured": client is not None,
        "user": user,
        "sync_running": request.app.state.sync_task is not None
        and not request.app.state.sync_task.done(),
    }


async def start_sync_if_needed(request: Request) -> None:
    app = request.app
    async with app.state.sync_lock:
        task = app.state.sync_task
        if task is not None and not task.done():
            return

        app.state.sync_task = asyncio.create_task(
            run_historical_sync(
                app.state.telegram_client,
                app.state.db,
                app.state.data_dir,
                app.state.config.sync.photos,
            )
        )


def auth_error(error: Exception) -> HTTPException:
    if isinstance(error, (ApiIdInvalidError, ConnectionApiIdInvalidError)):
        return HTTPException(status_code=400, detail="Invalid Telegram API ID or API hash")
    if isinstance(error, FloodWaitError):
        return HTTPException(
            status_code=429,
            detail=f"Telegram requests flood wait: retry in {error.seconds} seconds",
        )
    if isinstance(error, PhoneNumberInvalidError):
        return HTTPException(status_code=400, detail="Invalid phone number")
    if isinstance(error, PhoneCodeInvalidError):
        return HTTPException(status_code=400, detail="Invalid code")
    if isinstance(error, PhoneCodeExpiredError):
        return HTTPException(status_code=400, detail="Code expired, request a new one")
    if isinstance(error, PasswordHashInvalidError):
        return HTTPException(status_code=400, detail="Invalid 2FA password")
    return HTTPException(status_code=500, detail=str(error))


async def ensure_auth_client(
    request: Request,
    payload: SendCodeRequest,
) -> TelegramClientCredentials | None:
    app = request.app
    if app.state.telegram_client is not None:
        return None

    if payload.api_id is None or not payload.api_hash:
        raise HTTPException(status_code=400, detail="Enter Telegram API ID and API hash")

    credentials = TelegramClientCredentials(payload.api_id, payload.api_hash.strip())
    app.state.telegram_client = create_client(credentials, app.state.data_dir)
    register_live_sync(
        app.state.telegram_client,
        app.state.db,
        app.state.data_dir,
        app.state.config.sync.photos,
    )
    return credentials


@router.get("/auth/status")
async def auth_status(request: Request) -> dict[str, Any]:
    return await auth_response(request)


@router.post("/auth/send-code")
async def send_code(
    request: Request,
    payload: SendCodeRequest,
) -> dict[str, Any]:
    credentials = await ensure_auth_client(request, payload)
    client = request.app.state.telegram_client
    try:
        await ensure_client_connected(request)
        if await client.is_user_authorized():
            await start_sync_if_needed(request)
            return await auth_response(request)

        sent = await client.send_code_request(payload.phone)
    except Exception as error:
        if credentials is not None and isinstance(
            error,
            (ApiIdInvalidError, ConnectionApiIdInvalidError),
        ):
            await client.disconnect()
            request.app.state.telegram_client = None
        elif credentials is not None:
            save_client_credentials(
                request.app.state.data_dir,
                credentials.api_id,
                credentials.api_hash,
            )
        raise auth_error(error) from error

    if credentials is not None:
        save_client_credentials(
            request.app.state.data_dir,
            credentials.api_id,
            credentials.api_hash,
        )
    request.app.state.auth_phone = payload.phone
    request.app.state.auth_phone_code_hash = sent.phone_code_hash
    return {"authorized": False, "status": "code_sent"}


@router.post("/auth/sign-in")
async def sign_in(
    request: Request,
    payload: SignInRequest,
) -> dict[str, Any]:
    await ensure_client_connected(request)
    phone = request.app.state.auth_phone
    phone_code_hash = request.app.state.auth_phone_code_hash

    if not phone or not phone_code_hash:
        raise HTTPException(status_code=400, detail="Request code first")

    try:
        await request.app.state.telegram_client.sign_in(
            phone=phone,
            code=payload.code,
            phone_code_hash=phone_code_hash,
        )
    except SessionPasswordNeededError:
        return {"authorized": False, "status": "password_required"}
    except Exception as error:
        raise auth_error(error) from error

    request.app.state.auth_phone = None
    request.app.state.auth_phone_code_hash = None
    await start_sync_if_needed(request)
    return await auth_response(request)


@router.post("/auth/password")
async def sign_in_password(
    request: Request,
    payload: PasswordRequest,
) -> dict[str, Any]:
    await ensure_client_connected(request)

    try:
        await request.app.state.telegram_client.sign_in(password=payload.password)
    except Exception as error:
        raise auth_error(error) from error

    request.app.state.auth_phone = None
    request.app.state.auth_phone_code_hash = None
    await start_sync_if_needed(request)
    return await auth_response(request)


@router.get("/chats")
async def chats(request: Request) -> list[dict[str, Any]]:
    return await list_chats(get_db(request))


@router.get("/chats/{chat_id}/messages")
async def messages(
    request: Request,
    chat_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict[str, Any]]:
    return await list_messages(get_db(request), chat_id, offset, limit)


@router.get("/contacts/{contact_id}")
async def contact(request: Request, contact_id: int) -> dict[str, Any]:
    result = await get_contact(get_db(request), contact_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    return result


@router.get("/search")
async def search(
    request: Request,
    q: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict[str, Any]]:
    return await search_messages(get_db(request), q, limit)
