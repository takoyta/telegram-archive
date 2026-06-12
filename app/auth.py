import asyncio
import os
from pathlib import Path

from app.telegram_auth import create_client, load_client_credentials, save_client_credentials

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))


async def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    credentials = load_client_credentials(DATA_DIR)
    if credentials is None:
        api_id = input("api_id: ").strip()
        api_hash = input("api_hash: ").strip()
        credentials = save_client_credentials(DATA_DIR, int(api_id), api_hash)

    client = create_client(credentials, DATA_DIR)
    phone = os.getenv("TELEGRAM_PHONE")
    password = os.getenv("TELEGRAM_PASSWORD")
    print("Telegram login. Enter phone, code, and 2FA password if enabled.")

    start_kwargs: dict[str, str] = {}
    if phone:
        start_kwargs["phone"] = phone
    if password:
        start_kwargs["password"] = password
    await client.start(**start_kwargs)
    me = await client.get_me()
    name = me.first_name or me.username or me.id
    print(f"OK: logged in as {name}")
    print(f"Session saved to {DATA_DIR / 'session.session'}")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
