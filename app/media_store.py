from pathlib import Path


class MediaDeleteError(OSError):
    pass


def delete_message_files(data_dir: Path, record: dict) -> None:
    paths: set[Path] = set()
    stored = stored_media_file(data_dir, record.get("media_path"))
    if stored is not None:
        paths.add(stored)

    chat_id = record.get("chat_id")
    telegram_id = record.get("telegram_id")
    if isinstance(chat_id, int) and isinstance(telegram_id, int):
        folder = (data_dir / "media" / str(chat_id)).resolve()
        media_root = (data_dir / "media").resolve()
        if folder.is_dir() and _is_inside(folder, media_root):
            for path in folder.glob(f"{telegram_id}.*"):
                resolved = path.resolve()
                if path.is_file() and _is_inside(resolved, folder):
                    paths.add(resolved)

    _unlink_all(paths)


def delete_avatar_file(data_dir: Path, record: dict) -> None:
    paths: set[Path] = set()
    stored = stored_media_file(data_dir, record.get("path"))
    if stored is not None:
        paths.add(stored)

    contact_id = record.get("contact_id")
    photo_id = record.get("photo_id")
    if isinstance(contact_id, int) and isinstance(photo_id, int):
        canonical = (
            data_dir / "media" / "avatars" / f"{contact_id}_{photo_id}.jpg"
        ).resolve()
        media_root = (data_dir / "media").resolve()
        if _is_inside(canonical, media_root):
            paths.add(canonical)

    _unlink_all(paths)


def stored_media_file(data_dir: Path, relative: str | None) -> Path | None:
    if not relative or not str(relative).strip():
        return None

    media_root = (data_dir / "media").resolve()
    candidate = (data_dir / str(relative)).resolve()
    if not _is_inside(candidate, media_root):
        return None
    return candidate


def _unlink_all(paths: set[Path]) -> None:
    errors: list[str] = []
    for path in paths:
        if not path.exists():
            continue
        if not path.is_file():
            continue
        try:
            path.unlink()
        except OSError as error:
            errors.append(f"{path.name}: {error}")
    if errors:
        raise MediaDeleteError("; ".join(errors))


def _is_inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True
