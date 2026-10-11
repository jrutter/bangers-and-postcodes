"""Spotify Web API: client-credentials matching, and the user login used for playlists."""

from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import urlencode

import httpx

# The Spotify app Jake registered only allows this redirect URI.
REDIRECT_URI = "http://127.0.0.1:8888/callback"
AUTH_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
API_ROOT = "https://api.spotify.com/v1"
PLAYLIST_SCOPES = ("playlist-modify-private", "playlist-modify-public")


class SpotifyError(RuntimeError):
    pass


def normalize_name(name: str) -> str:
    text = (name or "").casefold().replace("&", " and ")
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    if text.startswith("the "):
        text = text[4:].strip()
    return text


def names_match(left: str, right: str) -> bool:
    return bool(normalize_name(left)) and normalize_name(left) == normalize_name(right)


class SpotifyClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        redirect_uri: str = REDIRECT_URI,
        http: httpx.Client | None = None,
    ) -> None:
        if not client_id or not client_secret:
            raise SpotifyError(
                "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET. See .env.example."
            )
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self._http = http or httpx.Client(timeout=30.0)
        self._owns_http = http is None
        self._token: str | None = None

    @classmethod
    def from_env(cls, *, http: httpx.Client | None = None) -> "SpotifyClient":
        return cls(
            os.environ.get("SPOTIFY_CLIENT_ID", "").strip(),
            os.environ.get("SPOTIFY_CLIENT_SECRET", "").strip(),
            redirect_uri=os.environ.get("SPOTIFY_REDIRECT_URI", REDIRECT_URI).strip()
            or REDIRECT_URI,
            http=http,
        )

    def close(self) -> None:
        if self._owns_http:
            self._http.close()

    def client_credentials_token(self) -> str:
        if self._token:
            return self._token
        response = self._http.post(
            TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(self.client_id, self.client_secret),
        )
        payload = _json_or_error(response, "client-credentials token")
        token = payload.get("access_token")
        if not token:
            raise SpotifyError("Spotify token response had no access_token.")
        self._token = token
        return token

    def search_artists(self, name: str, *, limit: int = 10) -> list[dict]:
        payload = self._api_get(
            "/search",
            {"q": f'artist:"{name}"', "type": "artist", "limit": limit},
        )
        return list(((payload.get("artists") or {}).get("items")) or [])

    def get_artist(self, artist_id: str) -> dict:
        return self._api_get(f"/artists/{artist_id}")

    def top_tracks(self, artist_id: str, *, market: str = "GB") -> list[dict]:
        payload = self._api_get(f"/artists/{artist_id}/top-tracks", {"market": market})
        return list(payload.get("tracks") or [])

    def search_tracks(self, name: str, *, limit: int = 5) -> list[dict]:
        payload = self._api_get(
            "/search",
            {"q": f'artist:"{name}"', "type": "track", "limit": limit, "market": "GB"},
        )
        return list(((payload.get("tracks") or {}).get("items")) or [])

    def authorize_url(self, state: str, scopes: tuple[str, ...] = PLAYLIST_SCOPES) -> str:
        query = urlencode(
            {
                "client_id": self.client_id,
                "response_type": "code",
                "redirect_uri": self.redirect_uri,
                "scope": " ".join(scopes),
                "state": state,
            }
        )
        return f"{AUTH_URL}?{query}"

    def exchange_code(self, code: str) -> dict:
        response = self._http.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.redirect_uri,
            },
            auth=(self.client_id, self.client_secret),
        )
        return _json_or_error(response, "authorization-code exchange")

    def current_user(self, access_token: str) -> dict:
        return self._api_get("/me", token=access_token)

    def create_playlist(
        self,
        access_token: str,
        *,
        name: str,
        description: str,
        public: bool,
    ) -> dict:
        return self._api_send(
            "POST",
            "/me/playlists",
            token=access_token,
            json_body={
                "name": name,
                "description": description[:300],
                "public": public,
            },
        )

    def add_tracks(self, access_token: str, playlist_id: str, uris: list[str]) -> dict:
        return self._api_send(
            "POST",
            f"/playlists/{playlist_id}/tracks",
            token=access_token,
            json_body={"uris": uris},
        )

    def _api_get(self, path: str, params: dict | None = None, token: str | None = None) -> dict:
        return self._api_send("GET", path, params=params, token=token)

    def _api_send(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json_body: dict | None = None,
        token: str | None = None,
    ) -> dict:
        access = token or self.client_credentials_token()
        response = self._http.request(
            method,
            f"{API_ROOT}{path}",
            params=params,
            json=json_body,
            headers={"Authorization": f"Bearer {access}"},
        )
        if response.status_code == 204 or not response.content:
            return {}
        return _json_or_error(response, f"{method} {path}")


def _json_or_error(response: httpx.Response, what: str) -> dict:
    try:
        payload: Any = response.json()
    except Exception as exc:  # noqa: BLE001
        raise SpotifyError(
            f"Spotify {what} returned {response.status_code} and no JSON."
        ) from exc
    if response.status_code >= 400:
        message = ""
        if isinstance(payload, dict):
            message = payload.get("error_description") or ""
            error = payload.get("error")
            if isinstance(error, dict):
                message = error.get("message") or message
            elif isinstance(error, str) and not message:
                message = error
        raise SpotifyError(f"Spotify {what} failed ({response.status_code}): {message}")
    if not isinstance(payload, dict):
        raise SpotifyError(f"Spotify {what} returned an unexpected payload.")
    return payload


def metrics_from_artist(artist: dict) -> dict:
    """Followers and popularity are optional. Newer Spotify apps often omit them."""
    followers = None
    follower_block = artist.get("followers")
    if isinstance(follower_block, dict) and follower_block.get("total") is not None:
        followers = follower_block.get("total")
    popularity = artist.get("popularity")
    if not isinstance(popularity, int):
        popularity = None
    images = artist.get("images") or []
    image = images[0].get("url") if images and isinstance(images[0], dict) else None
    external = artist.get("external_urls") or {}
    return {
        "id": artist.get("id"),
        "name": artist.get("name"),
        "url": external.get("spotify"),
        "followers": followers,
        "popularity": popularity,
        "image": image,
    }


def choose_artist(candidates: list[dict], local_name: str) -> dict | None:
    exact = [artist for artist in candidates if names_match(artist.get("name") or "", local_name)]
    if not exact:
        return None
    return max(exact, key=_artist_rank)


def _artist_rank(artist: dict) -> tuple:
    popularity = artist.get("popularity")
    followers = None
    if isinstance(artist.get("followers"), dict):
        followers = artist["followers"].get("total")
    return (
        popularity if isinstance(popularity, int) else -1,
        followers if isinstance(followers, int) else -1,
        artist.get("name") or "",
    )


def choose_track(tracks: list[dict]) -> dict | None:
    usable = [track for track in tracks if track.get("id")]
    if not usable:
        return None
    ranked = sorted(usable, key=lambda track: track.get("popularity") if isinstance(track.get("popularity"), int) else -1, reverse=True)
    # Keep Spotify's own order when nobody has a popularity figure.
    if not any(isinstance(track.get("popularity"), int) for track in usable):
        picked = usable[0]
    else:
        picked = ranked[0]
    album = picked.get("album") or {}
    return {
        "id": picked.get("id"),
        "name": picked.get("name"),
        "uri": picked.get("uri") or f"spotify:track:{picked.get('id')}",
        "preview_url": picked.get("preview_url"),
        "album": album.get("name") if isinstance(album, dict) else None,
        "popularity": picked.get("popularity") if isinstance(picked.get("popularity"), int) else None,
    }


def match_artist(client: SpotifyClient, artist: dict, *, market: str = "GB") -> dict:
    """Attach a Spotify match and one representative track. Missing data stays null."""
    name = artist.get("name") or ""
    try:
        candidates = client.search_artists(name)
    except SpotifyError as exc:
        return {**artist, "spotify": None, "spotify_error": str(exc)}
    chosen = choose_artist(candidates, name)
    if not chosen or not chosen.get("id"):
        return {**artist, "spotify": None}
    profile = metrics_from_artist(chosen)
    if profile["popularity"] is None or profile["followers"] is None:
        try:
            fetched = client.get_artist(chosen["id"])
            filled = metrics_from_artist(fetched)
            for key in ("followers", "popularity", "url", "image", "name"):
                if profile.get(key) is None and filled.get(key) is not None:
                    profile[key] = filled[key]
        except SpotifyError:
            pass
    track = None
    try:
        track = choose_track(client.top_tracks(chosen["id"], market=market))
    except SpotifyError:
        track = None
    if track is None:
        try:
            track = choose_track(client.search_tracks(name))
        except SpotifyError:
            track = None
    profile["match"] = "exact"
    profile["representative_track"] = track
    return {**artist, "spotify": profile}


def match_catalogue(client: SpotifyClient, artists: list[dict], *, market: str = "GB") -> list[dict]:
    return [match_artist(client, artist, market=market) for artist in artists]
