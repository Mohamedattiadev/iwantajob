from .arbeitnow import collect_arbeitnow
from .base import CollectedJob, upsert_jobs
from .hn import collect_hn
from .jobicy import collect_jobicy
from .remoteok import collect_remoteok
from .wwr import collect_wwr

# Paid collectors (adzuna, jsearch/rapidapi) are disabled to keep ops cost at $0.
# To re-enable: restore the import + entry below, and set the matching env vars
# in `.env`. The modules themselves still live in this package.
COLLECTORS = {
    "remoteok": collect_remoteok,
    "hn": collect_hn,
    "wwr": collect_wwr,
    "arbeitnow": collect_arbeitnow,
    "jobicy": collect_jobicy,
}

__all__ = ["CollectedJob", "upsert_jobs", "COLLECTORS"]
