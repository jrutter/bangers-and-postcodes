"""Command line for discovery, Spotify matching, playlists, and the stats page."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from bangers_postcodes.discover import discover
from bangers_postcodes.playlist import (
    DEFAULT_DESCRIPTION,
    DEFAULT_PLAYLIST_NAME,
    create_playlist,
    login,
)
from bangers_postcodes.spotify import SpotifyClient, SpotifyError
from bangers_postcodes.spotify import match_catalogue
from bangers_postcodes.stats import build_stats

DEFAULT_ARTISTS = "data/artists.json"
DEFAULT_RUN = "data/run.json"


def main(argv: list[str] | None = None) -> None:
    load_env()
    parser = argparse.ArgumentParser(
        prog="bangers",
        description="Bangers & Postcodes: southwest London artists, by postcode.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    discover_cmd = sub.add_parser(
        "discover",
        help="Find local artists on MusicBrainz and Wikidata.",
    )
    discover_cmd.add_argument("--output", default=DEFAULT_ARTISTS)

    run_cmd = sub.add_parser(
        "run",
        help="Discover artists, match them on Spotify, and write stats.",
    )
    run_cmd.add_argument(
        "--artists",
        help="Reuse a saved discovery file instead of querying MusicBrainz and Wikidata again.",
    )
    run_cmd.add_argument("--output", default=DEFAULT_RUN)
    run_cmd.add_argument(
        "--save-artists",
        default=DEFAULT_ARTISTS,
        help="Where to write the discovery file when discovery runs live.",
    )

    playlist_cmd = sub.add_parser(
        "playlist",
        help="Log in with Spotify and create a playlist of representative tracks.",
    )
    playlist_cmd.add_argument("--input", default=DEFAULT_RUN)
    playlist_cmd.add_argument("--name", default=DEFAULT_PLAYLIST_NAME)
    playlist_cmd.add_argument("--description", default=DEFAULT_DESCRIPTION)
    playlist_cmd.add_argument(
        "--public",
        action="store_true",
        help="Create a public playlist. The default is private.",
    )
    playlist_cmd.add_argument(
        "--no-browser",
        action="store_true",
        help="Print the login URL instead of opening a browser.",
    )

    serve_cmd = sub.add_parser("serve", help="Open the local stats page.")
    serve_cmd.add_argument("--host", default="127.0.0.1")
    serve_cmd.add_argument("--port", type=int, default=8741)
    serve_cmd.add_argument("--artists", default=DEFAULT_ARTISTS)
    serve_cmd.add_argument("--run", default=DEFAULT_RUN)

    args = parser.parse_args(argv)
    try:
        if args.command == "discover":
            cmd_discover(args)
        elif args.command == "run":
            cmd_run(args)
        elif args.command == "playlist":
            cmd_playlist(args)
        elif args.command == "serve":
            cmd_serve(args)
        else:
            parser.error(f"Unknown command {args.command}")
    except (SpotifyError, OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


def cmd_discover(args) -> None:
    document = discover(progress=_log)
    _write_json(args.output, _public_document(document))
    print(f"Wrote {document['artist_count']} artists to {args.output}")


def cmd_run(args) -> None:
    if args.artists:
        document = _read_json(args.artists)
        print(f"Using {document.get('artist_count', len(document.get('artists', [])))} artists from {args.artists}")
    else:
        document = discover(progress=_log)
        _write_json(args.save_artists, _public_document(document))
        print(f"Wrote {document['artist_count']} artists to {args.save_artists}")
    client = SpotifyClient.from_env()
    try:
        print(f"Matching {len(document['artists'])} artists on Spotify")
        matched = match_catalogue(client, document["artists"])
    finally:
        client.close()
    stats = build_stats(matched)
    output = {
        **_public_document(document),
        "artists": matched,
        "artist_count": len(matched),
        "stats": stats,
    }
    _write_json(args.output, output)
    print(
        f"Wrote {args.output}: {stats['spotify_matched']} Spotify matches, "
        f"{stats['spotify_with_track']} tracks, {stats['spotify_unmatched']} unmatched."
    )
    for row in stats["by_postcode"]:
        print(f"  {row['postcode']}: {row['artist_count']} artists")


def cmd_playlist(args) -> None:
    document = _read_json(args.input)
    client = SpotifyClient.from_env()
    try:
        print("Waiting for Spotify login at http://127.0.0.1:8888/callback")
        token = login(client, open_browser=not args.no_browser)
        created = create_playlist(
            client,
            token,
            document.get("artists") or [],
            name=args.name,
            description=args.description,
            public=args.public,
        )
    finally:
        client.close()
    visibility = "public" if created["public"] else "private"
    print(f"Created {visibility} playlist {created['name']} with {created['track_count']} tracks.")
    if created.get("url"):
        print(created["url"])


def cmd_serve(args) -> None:
    from bangers_postcodes.server import serve

    serve(args.host, args.port, artists_path=args.artists, run_path=args.run)


def load_env(path: str = ".env") -> None:
    env_path = Path(path)
    if not env_path.is_file():
        return
    for line in env_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _public_document(document: dict) -> dict:
    artists = []
    for artist in document.get("artists") or []:
        cleaned = {key: value for key, value in artist.items() if not key.startswith("_")}
        artists.append(cleaned)
    return {**document, "artists": artists, "artist_count": len(artists)}


def _write_json(path: str, payload: dict) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def _read_json(path: str) -> dict:
    source = Path(path)
    if not source.is_file():
        raise OSError(f"No file at {path}. Run `bangers discover` or `bangers run` first.")
    return json.loads(source.read_text())


def _log(message: str) -> None:
    print(message, file=sys.stderr)
