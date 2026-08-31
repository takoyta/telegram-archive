# Project Instructions & Rules

## Application Versioning Rule
- **Bump Version on Every Requested Feature**:
  - Whenever a new feature, improvement, or task requested by the user is implemented, you MUST increment the application version (e.g. `0.1.0` -> `0.1.1` for small improvements/fixes, or `0.2.0` for larger features).
  - Version source of truth is located in [app/version.py](file:///d:/telegram_backuper/app/version.py) as `__version__ = "X.Y.Z"`.
  - The version must be exposed via API (`/api/version` and `/api/auth/status`) and rendered in the interface (sidebar header badge, auth screen, boot screen).
  - When version is updated, ensure `app/version.py` is updated and any default HTML placeholders or references are in sync.
