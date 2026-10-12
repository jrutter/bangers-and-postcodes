"""Discovery command. The website reads data/artists.json; it does not call this live."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from bangers_postcodes.build_london import build_london
from bangers_postcodes.discover import discover
from bangers_postcodes.venues_build import refresh_venues

DEFAULT_ARTISTS = "data/artists.json"
DEFAULT_VENUES = "data/venues.json"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="bangers",
        description="Find London artists on MusicBrainz and Wikidata.",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("places", help="Rebuild London places and postcode district shapes.")
    discover_cmd = sub.add_parser(
        "discover",
        help="Find local artists on MusicBrainz and Wikidata.",
    )
    discover_cmd.add_argument("--output", default=DEFAULT_ARTISTS)
    venues_cmd = sub.add_parser("venues", help="Rebuild the London music-venue list.")
    venues_cmd.add_argument("--output", default=DEFAULT_VENUES)
    args = parser.parse_args(argv)
    try:
        if args.command == "places":
            summary = build_london(progress=_log)
            print(f"Wrote {summary['districts']} districts and {summary['places']} places")
        elif args.command == "discover":
            document = discover(progress=_log)
            public = _public_document(document)
            _write_json(args.output, public)
            print(f"Wrote {public['artist_count']} artists to {args.output}")
        elif args.command == "venues":
            document = refresh_venues(progress=_log)
            _write_json(args.output, document)
            print(f"Wrote {document['venue_count']} venues to {args.output}")
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
