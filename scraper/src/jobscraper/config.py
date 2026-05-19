from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = Path(os.environ.get("JOBSCRAPER_DATA", ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "jobs.sqlite"
DB_URL = os.environ.get("JOBSCRAPER_DB_URL", f"sqlite:///{DB_PATH}")

USER_AGENT = (
    "jobscraper/0.1 (+https://github.com/mohamedattiaDev; personal learning project)"
)
HTTP_TIMEOUT = 30.0
HTTP_RETRIES = 3
POLITE_DELAY_SECONDS = 1.0
