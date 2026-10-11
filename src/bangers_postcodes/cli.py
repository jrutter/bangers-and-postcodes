"""Discovery command. The website reads data/artists.json; it does not call this live."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from bangers_postcodes.discover import discover

DEFAULT_ARTISTS = "data/artists.json"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="bangers",
        description="Find southwest London artists on MusicBrainz and Wikidata.",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    discover_cmd = sub.add_parser(
        "discover",
        help="Find local artists on MusicBrainz and Wikidata.",
    )
    discover_cmd.add_argument("--output", default=DEFAULT_ARTISTS)
    args = parser.parse_args(argv)
    try:
        if args.command == "discover":
            document = discover(progress=_log)
            public = _public_document(document)
            _write_json(args.output, public)
            print(f"Wrote {public['artist_count']} artists to {args.output}")
        else:
            parser.error(f"Unknown command {args.command}")
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


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


def _log(message: str) -> None:
    print(message, file=sys.stderr)
