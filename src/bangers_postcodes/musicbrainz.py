"""MusicBrainz JSON client. One request at a time, with a contact user-agent."""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Callable

import httpx

USER_AGENT = (
    "BangersAndPostcodes/0.2 "
    "(London artist discovery; contact: bangers-postcodes@example.com)"
)
API_ROOT = "https://musicbrainz.org/ws/2"


class MusicBrainzError(RuntimeError):
    pass


# The search API rejects offset+limit above 500.
SEARCH_WINDOW = 500

COUNTRY_SHARDS = (
    "country:GB",
    "country:US",
    "NOT country:GB AND NOT country:US",
)
TYPE_SHARDS = (
    "type:person",
    "type:group",
    "NOT type:person AND NOT type:group",
)
_FIRST_HALF = " OR ".join(f"artist:{letter}*" for letter in "abcdefghijklm")
_SECOND_HALF = " OR ".join(f"artist:{letter}*" for letter in "nopqrstuvwxyz")
_ALL_LETTERS = " OR ".join(f"artist:{letter}*" for letter in "abcdefghijklmnopqrstuvwxyz")
NAME_SHARDS = (
    f"({_FIRST_HALF})",
    f"({_SECOND_HALF})",
    f"NOT ({_ALL_LETTERS})",
)
SHARD_LEVELS = (COUNTRY_SHARDS, TYPE_SHARDS, NAME_SHARDS)


def shard_query(query: str, depth: int) -> list[str]:
    """Narrow a search that would otherwise pass MusicBrainz's 500-row window."""
    return [f"({query}) AND ({clause})" for clause in SHARD_LEVELS[depth]]


class MusicBrainzClient:
    def __init__(
        self,
        *,
        http: httpx.Client | None = None,
        min_interval: float = 1.1,
        sleeper: Callable[[float], None] = time.sleep,
        now: Callable[[], float] = time.monotonic,
        max_retries: int = 8,
        cache_dir: Path | None = None,
    ) -> None:
        self._http = http or httpx.Client(
            timeout=40.0,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        self._owns_http = http is None
        self.min_interval = min_interval
        self._sleeper = sleeper
        self._now = now
        self._next_at = 0.0
        self.max_retries = max_retries
        self.cache_dir = cache_dir

    def close(self) -> None:
        if self._owns_http:
            self._http.close()

    def get(self, path: str, params: dict | None = None) -> dict:
        url = path if path.startswith("http") else f"{API_ROOT}{path}"
        cached = self._read_cache(url, params)
        if cached is not None:
            return cached
        last_error: Exception | None = None
        for attempt in range(self.max_retries):
            self._wait()
            try:
                response = self._http.get(url, params=params)
            except httpx.HTTPError as exc:
                last_error = exc
                self._sleeper(min(8.0, 1.5 * (attempt + 1)))
                continue
            if response.status_code in {429, 503} or response.status_code >= 500:
                last_error = MusicBrainzError(
                    f"MusicBrainz {response.status_code} for {url}"
                )
                self._sleeper(min(10.0, 1.5 * (attempt + 1)))
                continue
            if response.status_code == 404:
                raise MusicBrainzError(f"MusicBrainz 404 for {url}")
            if response.status_code >= 400:
                raise MusicBrainzError(
                    f"MusicBrainz {response.status_code} for {url}: {response.text[:300]}"
                )
            payload = response.json()
            if isinstance(payload, dict) and payload.get("error"):
                # The search server sometimes answers 200 with an error message
                # when it is busy. Treat that as retryable.
                last_error = MusicBrainzError(str(payload.get("error")))
                self._sleeper(min(30.0, 3.0 * (attempt + 1)))
                continue
            self._write_cache(url, params, payload)
            return payload
        raise MusicBrainzError(f"MusicBrainz request failed: {last_error}")

    def _cache_path(self, url: str, params: dict | None) -> Path | None:
        if self.cache_dir is None:
            return None
        key = hashlib.sha1(json.dumps({"url": url, "params": params or {}}, sort_keys=True).encode()).hexdigest()
        return self.cache_dir / key

    def _read_cache(self, url: str, params: dict | None) -> dict | None:
        path = self._cache_path(url, params)
        if path is None or not path.exists():
            return None
        payload = json.loads(path.read_text())
        return payload if isinstance(payload, dict) else None

    def _write_cache(self, url: str, params: dict | None, payload: dict) -> None:
        path = self._cache_path(url, params)
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload))

    def search_artists(self, query: str) -> list[dict]:
        return self._search(query, depth=0)

    def _search(self, query: str, depth: int) -> list[dict]:
        payload = self.get("/artist", {"query": query, "fmt": "json", "limit": 100, "offset": 0})
        total = int(payload.get("count") or 0)
        if total > SEARCH_WINDOW and depth < len(SHARD_LEVELS):
            print(
                f"  search has {total} hits, splitting so we stay inside the 500-row window",
                file=sys.stderr,
            )
            found: list[dict] = []
            seen: set[str] = set()
            for shard in shard_query(query, depth):
                for artist in self._search(shard, depth + 1):
                    artist_id = artist.get("id")
                    if artist_id and artist_id not in seen:
                        seen.add(artist_id)
                        found.append(artist)
            return found
        window = min(total, SEARCH_WINDOW)
        found = list(payload.get("artists") or [])
        offset = len(found)
        while offset < window:
            limit = min(100, window - offset)
            page = self.get(
                "/artist",
                {"query": query, "fmt": "json", "limit": limit, "offset": offset},
            )
            batch = page.get("artists") or []
            if not batch:
                break
            found.extend(batch)
            offset += len(batch)
            if len(batch) < limit:
                break
        return found[:window]

    def lookup_artist(self, mbid: str) -> dict:
        return self.get(f"/artist/{mbid}", {"fmt": "json", "inc": "aliases+tags"})

    def release_groups(self, mbid: str) -> list[dict]:
        payload = self.get(
            "/release-group",
            {"artist": mbid, "fmt": "json", "limit": 10},
        )
        return list(payload.get("release-groups") or [])

    def _wait(self) -> None:
        delay = self._next_at - self._now()
        if delay > 0:
            self._sleeper(delay)
        self._next_at = self._now() + self.min_interval
