from __future__ import annotations

import time

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from .config import HTTP_RETRIES, HTTP_TIMEOUT, POLITE_DELAY_SECONDS, USER_AGENT


def client() -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
        timeout=HTTP_TIMEOUT,
        follow_redirects=True,
    )


@retry(
    stop=stop_after_attempt(HTTP_RETRIES),
    wait=wait_exponential_jitter(initial=1, max=10),
    reraise=True,
)
def get(c: httpx.Client, url: str, **kw) -> httpx.Response:
    r = c.get(url, **kw)
    r.raise_for_status()
    time.sleep(POLITE_DELAY_SECONDS)
    return r
