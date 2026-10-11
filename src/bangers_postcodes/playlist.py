"""Authorization-code login on 127.0.0.1:8888 and playlist creation."""

from __future__ import annotations

import secrets
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from bangers_postcodes.spotify import PLAYLIST_SCOPES, REDIRECT_URI, SpotifyClient, SpotifyError

DEFAULT_PLAYLIST_NAME = "Bangers & Postcodes — SW London"
DEFAULT_DESCRIPTION = (
    "Artists from southwest London, Barnes to Wimbledon. "
    "Built by Bangers & Postcodes from public locality data."
)


class LoginError(RuntimeError):
    pass


def parse_callback_path(path: str, expected_state: str) -> str:
    parsed = urlparse(path)
    if parsed.path != "/callback":
        raise LoginError(f"Unexpected path {parsed.path}. The redirect URI is {REDIRECT_URI}.")
    query = parse_qs(parsed.query)
    error = (query.get("error") or [None])[0]
    if error:
        raise LoginError(f"Spotify authorization was declined ({error}).")
    state = (query.get("state") or [None])[0]
    if state != expected_state:
        raise LoginError("Spotify returned a state that does not match this login.")
    code = (query.get("code") or [None])[0]
    if not code:
        raise LoginError("Spotify callback had no authorization code.")
    return code


def track_uris(artists: list[dict]) -> list[str]:
    """One track per Spotify artist, highest popularity first, URIs deduped."""
    ranked = sorted(
        (artist for artist in artists if isinstance(artist.get("spotify"), dict)),
        key=lambda artist: (
            artist["spotify"].get("popularity") if isinstance(artist["spotify"].get("popularity"), int) else -1,
            artist["spotify"].get("followers") if isinstance(artist["spotify"].get("followers"), int) else -1,
        ),
        reverse=True,
    )
    uris: list[str] = []
    seen_tracks: set[str] = set()
    seen_artists: set[str] = set()
    for artist in ranked:
        spotify = artist["spotify"]
        artist_id = spotify.get("id")
        if artist_id and artist_id in seen_artists:
            continue
        track = spotify.get("representative_track") or {}
        uri = track.get("uri")
        if not uri or uri in seen_tracks:
            continue
        if artist_id:
            seen_artists.add(artist_id)
        seen_tracks.add(uri)
        uris.append(uri)
    return uris


def chunked(items: list[str], size: int = 100) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def login(client: SpotifyClient, *, open_browser: bool = True, timeout: float = 180.0) -> str:
    """Run the Authorization Code flow and return a user access token.

    Listens on the registered redirect URI, http://127.0.0.1:8888/callback.
    """
    parsed_redirect = urlparse(client.redirect_uri)
    if (parsed_redirect.scheme, parsed_redirect.hostname, parsed_redirect.port, parsed_redirect.path) != (
        "http",
        "127.0.0.1",
        8888,
        "/callback",
    ):
        raise LoginError(
            "Playlist login has to use http://127.0.0.1:8888/callback, "
            "the redirect URI registered for this Spotify app."
        )
    state = secrets.token_urlsafe(24)
    url = client.authorize_url(state, PLAYLIST_SCOPES)
    box: dict[str, str | Exception | None] = {"code": None, "error": None}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            try:
                box["code"] = parse_callback_path(self.path, state)
                body = (
                    "<!doctype html><meta charset='utf-8'><title>Bangers & Postcodes</title>"
                    "<p>Spotify is connected. You can close this tab and go back to the terminal.</p>"
                )
                status = 200
            except LoginError as exc:
                box["error"] = exc
                body = f"<!doctype html><meta charset='utf-8'><title>Bangers & Postcodes</title><p>{exc}</p>"
                status = 400
            data = body.encode()
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, fmt: str, *args) -> None:
            return

    parsed = urlparse(client.redirect_uri)
    try:
        server = HTTPServer((parsed.hostname or "127.0.0.1", parsed.port or 8888), Handler)
    except OSError as exc:
        raise LoginError(
            f"Could not listen on {client.redirect_uri}. Is another playlist login already running? {exc}"
        ) from exc
    server.timeout = timeout
    print("Open this URL if the browser does not:")
    print(url)
    if open_browser:
        webbrowser.open(url)
    server.handle_request()
    server.server_close()
    if isinstance(box["error"], Exception):
        raise box["error"]
    code = box["code"]
    if not isinstance(code, str):
        raise LoginError("Timed out waiting for the Spotify callback.")
    token_payload = client.exchange_code(code)
    access = token_payload.get("access_token")
    if not access:
        raise LoginError("Spotify did not return an access token.")
    return access


def create_playlist(
    client: SpotifyClient,
    access_token: str,
    artists: list[dict],
    *,
    name: str = DEFAULT_PLAYLIST_NAME,
    description: str = DEFAULT_DESCRIPTION,
    public: bool = False,
) -> dict:
    uris = track_uris(artists)
    if not uris:
        raise SpotifyError(
            "No Spotify tracks to add. Run `bangers run` first so artists have representative tracks."
        )
    playlist = client.create_playlist(
        access_token,
        name=name,
        description=description,
        public=public,
    )
    playlist_id = playlist.get("id")
    if not playlist_id:
        raise SpotifyError("Spotify created a playlist response with no id.")
    for batch in chunked(uris, 100):
        client.add_tracks(access_token, playlist_id, batch)
    external = playlist.get("external_urls") or {}
    return {
        "id": playlist_id,
        "name": playlist.get("name") or name,
        "url": external.get("spotify") or playlist.get("href"),
        "public": public,
        "track_count": len(uris),
    }
