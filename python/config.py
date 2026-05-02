import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _required(key: str) -> str:
    value = os.environ.get(key)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {key}. "
            f"Copy .env.example to .env and fill it in."
        )
    return value


MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
MYSQL_USER = _required("MYSQL_USER")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
MYSQL_DATABASE = _required("MYSQL_DATABASE")

ENCRYPTION_KEY = _required("ENCRYPTION_KEY")
ENCRYPTION_IV = _required("ENCRYPTION_IV")

CAPSOLVER_API_KEY = os.environ.get("CAPSOLVER_API_KEY", "")
TURNSTILE_SITE_KEY = os.environ.get("TURNSTILE_SITE_KEY", "")
TURNSTILE_SITE_URL = os.environ.get(
    "TURNSTILE_SITE_URL",
    "https://form.undip.ac.id/makanansehat/pendaftaran",
)
CAPSOLVER_TIMEOUT_S = float(os.environ.get("CAPSOLVER_TIMEOUT_S", "45"))
CAPSOLVER_POLL_INTERVAL_S = float(os.environ.get("CAPSOLVER_POLL_INTERVAL_S", "1.5"))

CHROMIUM_EXECUTABLE_PATH = os.environ.get(
    "CHROMIUM_EXECUTABLE_PATH", "/usr/bin/chromium-browser"
)
