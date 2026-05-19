from .adzuna import collect_adzuna
from .arbeitnow import collect_arbeitnow
from .base import CollectedJob, upsert_jobs
from .hn import collect_hn
from .jobicy import collect_jobicy
from .jsearch import collect_jsearch
from .remoteok import collect_remoteok
from .wwr import collect_wwr

COLLECTORS = {
    "remoteok": collect_remoteok,
    "hn": collect_hn,
    "wwr": collect_wwr,
    "arbeitnow": collect_arbeitnow,
    "jobicy": collect_jobicy,
    "adzuna": collect_adzuna,  # needs ADZUNA_APP_ID + ADZUNA_APP_KEY
    "jsearch": collect_jsearch,  # needs RAPIDAPI_KEY (gives LinkedIn data legally)
}

__all__ = ["CollectedJob", "upsert_jobs", "COLLECTORS"]
