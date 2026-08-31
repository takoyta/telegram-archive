---
description: Application versioning and UI display rules
alwaysApply: true
---

# Versioning Rule

- **Bump Version on Every Requested Feature**:
  - Whenever a new feature, improvement, or task requested by the user is implemented, increment the application version (e.g. semantic versioning: `0.1.0` -> `0.1.1` or `0.2.0`).
  - Source of truth: `app/version.py` (`__version__ = "X.Y.Z"`).
  - The version is served via API (`/api/version`, `/api/auth/status`) and displayed in the UI (sidebar header badge, auth screen, boot screen).
