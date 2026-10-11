"""Counts and rankings over a local-artist catalogue."""

from __future__ import annotations

from bangers_postcodes.areas import PLACES, postcodes as all_postcodes


def build_stats(artists: list[dict]) -> dict:
    by_place = []
    for place in PLACES:
        matched = [artist for artist in artists if _has_place(artist, place.id)]
        by_place.append(
            {
                "place_id": place.id,
                "place_name": place.name,
                "postcodes": list(place.postcodes),
                "precision": place.precision,
                "artist_count": len(matched),
                "spotify_matched": sum(1 for artist in matched if _spotify(artist)),
                "note": place.note,
            }
        )

    by_postcode = []
    for postcode in all_postcodes():
        place_ids = [place.id for place in PLACES if postcode in place.postcodes]
        matched = [artist for artist in artists if _has_postcode(artist, postcode, precision="place")]
        by_postcode.append(
            {
                "postcode": postcode,
                "place_ids": place_ids,
                "artist_count": len(matched),
                "spotify_matched": sum(1 for artist in matched if _spotify(artist)),
            }
        )

    spotify_artists = [artist for artist in artists if _spotify(artist)]
    top = sorted(spotify_artists, key=_rank, reverse=True)[:10]
    with_popularity = sum(1 for artist in spotify_artists if _spotify(artist).get("popularity") is not None)
    with_followers = sum(1 for artist in spotify_artists if _spotify(artist).get("followers") is not None)
    with_track = sum(
        1
        for artist in spotify_artists
        if (_spotify(artist).get("representative_track") or {}).get("uri")
    )
    return {
        "artist_count": len(artists),
        "place_precision_count": sum(1 for artist in artists if _any_precision(artist, "place")),
        "borough_precision_count": sum(1 for artist in artists if _any_precision(artist, "borough")),
        "spotify_matched": len(spotify_artists),
        "spotify_unmatched": len(artists) - len(spotify_artists),
        "spotify_with_popularity": with_popularity,
        "spotify_with_followers": with_followers,
        "spotify_with_track": with_track,
        "by_place": by_place,
        "by_postcode": by_postcode,
        "top_artists": [_top_row(artist) for artist in top],
        "by_type": _by_type(artists),
    }


def _top_row(artist: dict) -> dict:
    spotify = _spotify(artist) or {}
    track = spotify.get("representative_track") or {}
    return {
        "name": artist.get("name"),
        "mbid": artist.get("mbid"),
        "places": [place.get("place_name") for place in artist.get("locality") or []],
        "postcodes": _postcodes(artist),
        "spotify_id": spotify.get("id"),
        "followers": spotify.get("followers"),
        "popularity": spotify.get("popularity"),
        "track": track.get("name"),
        "track_uri": track.get("uri"),
    }


def _rank(artist: dict) -> tuple:
    spotify = _spotify(artist) or {}
    popularity = spotify.get("popularity")
    followers = spotify.get("followers")
    return (
        popularity if isinstance(popularity, int) else -1,
        followers if isinstance(followers, int) else -1,
        artist.get("name") or "",
    )


def _by_type(artists: list[dict]) -> list[dict]:
    counts: dict[str, int] = {}
    for artist in artists:
        label = artist.get("type") or "Unknown"
        counts[label] = counts.get(label, 0) + 1
    return [{"type": label, "artist_count": count} for label, count in sorted(counts.items())]


def _has_place(artist: dict, place_id: str) -> bool:
    return any(place.get("place_id") == place_id for place in artist.get("locality") or [])


def _has_postcode(artist: dict, postcode: str, precision: str) -> bool:
    for place in artist.get("locality") or []:
        if place.get("precision") != precision:
            continue
        if postcode in (place.get("postcodes") or []):
            return True
    return False


def _any_precision(artist: dict, precision: str) -> bool:
    return any(place.get("precision") == precision for place in artist.get("locality") or [])


def _postcodes(artist: dict) -> list[str]:
    found: list[str] = []
    for place in artist.get("locality") or []:
        if place.get("precision") != "place":
            continue
        for postcode in place.get("postcodes") or []:
            if postcode not in found:
                found.append(postcode)
    return found


def _spotify(artist: dict) -> dict | None:
    spotify = artist.get("spotify")
    if isinstance(spotify, dict) and spotify.get("id"):
        return spotify
    return None
