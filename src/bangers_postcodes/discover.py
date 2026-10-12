"""Find musical artists linked to London places."""

from __future__ import annotations

import re
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from bangers_postcodes.areas import PLACES, Place, places_by_mbid, places_by_qid
from bangers_postcodes.musicbrainz import MusicBrainzClient
from bangers_postcodes.wikidata import build_query, fetch_rows, group_rows, has_specific_music_role

CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / ".mb-cache"

# Tags and comment words that mean "this MusicBrainz artist is musical"
# without a further release-group lookup.
MUSIC_TAGS = {
    "singer",
    "songwriter",
    "rapper",
    "producer",
    "dj",
    "musician",
    "guitarist",
    "drummer",
    "bassist",
    "vocalist",
    "composer",
    "band",
    "hip hop",
    "hip-hop",
    "rap",
    "grime",
    "drill",
    "jazz",
    "rock",
    "pop",
    "electronic",
    "folk",
    "metal",
    "punk",
    "soul",
    "reggae",
    "indie",
    "dance",
    "house",
    "techno",
    "ambient",
    "classical",
    "piano",
    "mc",
    "singer-songwriter",
    "r&b",
    "rnb",
    "blues",
    "funk",
    "disco",
    "experimental",
    "idm",
    "post-rock",
    "post-punk",
    "britpop",
    "ska",
    "dubstep",
    "dub",
    "garage",
    "gospel",
    "opera",
    "violin",
    "drums",
    "bass",
    "guitar",
}
MUSIC_COMMENT_PHRASES = (
    "singer",
    "songwriter",
    "rapper",
    "guitarist",
    "drummer",
    "bassist",
    "musician",
    "composer",
    "producer",
    "vocalist",
    "dj",
    "mc",
    "band",
    "pianist",
    "organist",
    "violinist",
    "cellist",
    "saxophonist",
    "trumpeter",
    "flautist",
    "beatmaker",
    "uk artist",
    "british artist",
)
MUSICAL_RELEASE_TYPES = {"album", "single", "ep"}
GROUP_TYPES = {"group", "orchestra", "choir", "band"}
# Checked only when the comment has no music phrase. "songwriter" is handled
# first, so the substring "writer" does not throw out songwriters.
NON_MUSIC_COMMENT_PHRASES = (
    "illustrator",
    "novelist",
    "author",
    "poet",
    "screenwriter",
    "actor",
    "actress",
    "footballer",
    "politician",
    "comedian",
    "presenter",
    "journalist",
    "painter",
    "historian",
    "writer",
)


def search_plan(places: tuple[Place, ...] = PLACES) -> list[dict]:
    """One MusicBrainz artist query per distinct area name.

    Several places share a name (the Kingston district and the Kingston
    borough are both "Kingston upon Thames"). The query is by name because
    the artist index has no begin-area MBID field; hits are kept only when
    the returned area id is one of ours.
    """
    by_name: dict[str, list[str]] = defaultdict(list)
    for place in places:
        if not place.musicbrainz_area_name or not place.musicbrainz_area_mbid:
            continue
        if place.musicbrainz_area_mbid not in by_name[place.musicbrainz_area_name]:
            by_name[place.musicbrainz_area_name].append(place.musicbrainz_area_mbid)
    plan = []
    for name, mbids in by_name.items():
        quoted = name.replace('"', "")
        plan.append(
            {
                "area_name": name,
                "mbids": mbids,
                "query": f'beginarea:"{quoted}" OR area:"{quoted}"',
            }
        )
    return plan


def discover(
    *,
    mb: MusicBrainzClient | None = None,
    wikidata_rows: list[dict] | None = None,
    progress=None,
) -> dict:
    """Run discovery against MusicBrainz and Wikidata and return the artist document."""
    log = progress or (lambda message: None)
    client = mb or MusicBrainzClient(cache_dir=CACHE_DIR)
    owns_client = mb is None
    try:
        raw_by_mbid: dict[str, dict] = {}
        for step in search_plan():
            log(f"MusicBrainz search: {step['query']}")
            hits = client.search_artists(step["query"])
            kept = 0
            for hit in hits:
                if locality_from_mb(hit):
                    raw_by_mbid[hit["id"]] = hit
                    kept += 1
            log(f"  {len(hits)} hits, {kept} in London")

        if wikidata_rows is None:
            log("Wikidata: place of birth and location of formation")
            wikidata_rows = _fetch_wikidata(log)
            log(f"  {len(wikidata_rows)} Wikidata place claims")

        extra_lookups = []
        known = set(raw_by_mbid)
        for row in wikidata_rows:
            mbid = (row.get("mbid") or "").strip()
            if mbid and mbid not in known:
                extra_lookups.append(mbid)
                known.add(mbid)
        for mbid in extra_lookups:
            log(f"MusicBrainz lookup {mbid}")
            try:
                raw_by_mbid[mbid] = client.lookup_artist(mbid)
            except Exception as exc:  # noqa: BLE001 — keep the Wikidata row if MB has no artist
                log(f"  lookup failed: {exc}")

        release_cache: dict[str, list[dict]] = {}

        def releases_for(mbid: str) -> list[dict]:
            if mbid not in release_cache:
                log(f"Release groups for {mbid}")
                release_cache[mbid] = client.release_groups(mbid)
            return release_cache[mbid]

        artists = dedupe_artists(assemble_artists(raw_by_mbid, wikidata_rows, releases_for))
    finally:
        if owns_client:
            client.close()

    return document(artists)


def assemble_artists(
    raw_by_mbid: dict[str, dict],
    wikidata_rows: list[dict],
    releases_for,
) -> list[dict]:
    wd_by_mbid: dict[str, list[dict]] = defaultdict(list)
    wd_only: list[dict] = []
    for row in wikidata_rows:
        mbid = (row.get("mbid") or "").strip()
        if mbid:
            wd_by_mbid[mbid].append(row)
        else:
            wd_only.append(row)

    artists: list[dict] = []
    for mbid, raw in raw_by_mbid.items():
        mb_places = locality_from_mb(raw)
        wd_places = locality_from_wikidata(wd_by_mbid.get(mbid, []))
        if not mb_places and not wd_places:
            continue
        record = artist_record(raw, mb_places, wd_places)
        _fill_span_from_wikidata(record, wd_by_mbid.get(mbid, []))
        if not usable_name(record.get("name")) or not is_musical(record, releases_for):
            continue
        artists.append(record)

    for mbid, rows in wd_by_mbid.items():
        if mbid in raw_by_mbid:
            continue
        _append_wikidata_artist(artists, rows, mbid=mbid)

    seen_qids = {artist.get("wikidata_qid") for artist in artists if artist.get("wikidata_qid")}
    only_by_qid: dict[str, list[dict]] = defaultdict(list)
    for row in wd_only:
        qid = row.get("qid")
        if qid and qid not in seen_qids:
            only_by_qid[qid].append(row)
    for qid, rows in only_by_qid.items():
        _append_wikidata_artist(artists, rows, mbid=None)

    artists.sort(key=lambda artist: (artist.get("sort_name") or artist["name"]).casefold())
    attach_wikidata_qids(artists, wikidata_rows)
    return artists


def _append_wikidata_artist(artists: list[dict], rows: list[dict], *, mbid: str | None) -> None:
    # A generic "musician" occupation is a noisy Wikidata tag. Without a
    # MusicBrainz recording history we require a specific role or a group.
    combined = {
        "occupations": _flat(rows, "occupations"),
        "instance_of": _flat(rows, "instance_of"),
    }
    if not has_specific_music_role(combined):
        return
    sample_name = (rows[0].get("name") if rows else None) or ""
    if not usable_name(sample_name):
        return
    places = locality_from_wikidata(rows)
    if not places:
        return
    sample = rows[0]
    artists.append(
        {
            "mbid": mbid,
            "wikidata_qid": sample.get("qid"),
            "name": sample.get("name") or sample.get("qid"),
            "sort_name": sample.get("name") or sample.get("qid"),
            "type": "Group" if _looks_like_group(rows) else "Person",
            "disambiguation": None,
            "country": None,
            "life_span": _span_from_rows(rows),
            "tags": [],
            "musicbrainz": None,
            "locality": places,
        }
    )


def dedupe_artists(artists: list[dict]) -> list[dict]:
    """Collapse the same artist when Wikidata agrees, or the name, type, and place do."""
    kept: list[dict] = []
    for artist in artists:
        match = next((existing for existing in kept if _same_artist(existing, artist)), None)
        if match is None:
            kept.append(artist)
            continue
        _merge_artist(match, artist)
    kept.sort(key=lambda artist: (artist.get("sort_name") or artist["name"]).casefold())
    return kept


def _same_artist(left: dict, right: dict) -> bool:
    left_qid = left.get("wikidata_qid")
    right_qid = right.get("wikidata_qid")
    if left_qid and right_qid:
        return left_qid == right_qid
    if left_qid and right_qid and left_qid != right_qid:
        return False
    if _name_key(left.get("name")) != _name_key(right.get("name")):
        return False
    if (left.get("type") or "").casefold() != (right.get("type") or "").casefold():
        return False
    left_places = {place["place_id"] for place in left.get("locality") or []}
    right_places = {place["place_id"] for place in right.get("locality") or []}
    return bool(left_places & right_places)


def _merge_artist(primary: dict, extra: dict) -> None:
    if _artist_rank(extra) > _artist_rank(primary):
        primary["name"], extra["name"] = extra.get("name"), primary.get("name")
        primary["sort_name"], extra["sort_name"] = extra.get("sort_name"), primary.get("sort_name")
        primary["mbid"], extra["mbid"] = extra.get("mbid"), primary.get("mbid")
        primary["disambiguation"] = extra.get("disambiguation") or primary.get("disambiguation")
    if not primary.get("wikidata_qid"):
        primary["wikidata_qid"] = extra.get("wikidata_qid")
    if not primary.get("_wikidata_name"):
        primary["_wikidata_name"] = extra.get("_wikidata_name")
    if not primary.get("mbid"):
        primary["mbid"] = extra.get("mbid")
    primary["locality"] = _merge_places(primary.get("locality") or [], extra.get("locality") or [])
    tags = list(primary.get("tags") or [])
    for tag in extra.get("tags") or []:
        if tag not in tags:
            tags.append(tag)
    primary["tags"] = tags
    primary["life_span"] = _prefer_span(primary.get("life_span"), extra.get("life_span"))


def _artist_rank(artist: dict) -> tuple:
    """Prefer the public name, then the record that actually carries the music tags.

    Two MusicBrainz rows can share one Wikidata item. Claim count alone kept
    "4T Recordings" ahead of Four Tet, because the imprint row had picked up
    an extra place claim and the names sorted first.
    """
    label = _name_key(artist.get("_wikidata_name"))
    matches_label = 1 if label and _name_key(artist.get("name")) == label else 0
    claims = sum(len(place.get("claims") or []) for place in artist.get("locality") or [])
    span = artist.get("life_span") or {}
    return (
        matches_label,
        len(artist.get("tags") or []),
        claims,
        1 if span.get("begin") else 0,
        1 if artist.get("mbid") else 0,
    )


def _name_key(name: str | None) -> str:
    text = re.sub(r"[^a-z0-9]+", "", (name or "").casefold())
    return text[3:] if text.startswith("the") else text


def _prefer_span(left: dict | None, right: dict | None) -> dict | None:
    if not left:
        return right
    if not right:
        return left
    chosen = dict(left)
    if not chosen.get("begin") and right.get("begin"):
        chosen["begin"] = right.get("begin")
        chosen["source"] = right.get("source") or chosen.get("source")
    if not chosen.get("end") and right.get("end"):
        chosen["end"] = right.get("end")
    if chosen.get("ended") is None and right.get("ended") is not None:
        chosen["ended"] = right.get("ended")
    return chosen


def _fill_span_from_wikidata(record: dict, rows: list[dict]) -> None:
    extra = _span_from_rows(rows)
    record["life_span"] = _prefer_span(record.get("life_span"), extra)


def _span_from_rows(rows: list[dict]) -> dict:
    begins = [row.get("born") or row.get("inception") for row in rows]
    ends = [row.get("died") or row.get("dissolved") for row in rows]
    begin = next((year for year in begins if isinstance(year, int)), None)
    end = next((year for year in ends if isinstance(year, int)), None)
    return {
        "begin": str(begin) if begin else None,
        "end": str(end) if end else None,
        "ended": True if end else False if begin else None,
        "source": "wikidata" if begin or end else None,
    }


def _fetch_wikidata(log) -> list[dict]:
    qids = [place.wikidata_qid for place in PLACES if place.wikidata_qid]
    rows: list[dict] = []
    batch = 12
    last_error: Exception | None = None
    for index in range(0, len(qids), batch):
        chunk = qids[index : index + batch]
        log(f"  Wikidata places {index + 1}-{index + len(chunk)} of {len(qids)}")
        for attempt in range(4):
            try:
                rows.extend(fetch_rows(query=build_query(chunk)))
                last_error = None
                break
            except Exception as exc:  # noqa: BLE001 — Wikidata occasionally times out
                last_error = exc
                log(f"  Wikidata attempt {attempt + 1} failed: {exc}")
                time.sleep(2 * (attempt + 1))
        else:
            raise RuntimeError(f"Wikidata lookup failed: {last_error}")
        time.sleep(0.5)
    return group_rows(rows)


def document(artists: list[dict]) -> dict:
    return {
        "project": "Bangers & Postcodes",
        "description": "Musical artists linked to London, from the City and the inner postcodes out to the boroughs of Greater London.",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "places": [place.to_dict() for place in PLACES],
        "artist_count": len(artists),
        "artists": artists,
    }


def locality_from_mb(raw: dict) -> list[dict]:
    by_mbid = places_by_mbid()
    claims_by_place: dict[str, dict] = {}
    for field, key in (("area", "area"), ("begin-area", "begin-area")):
        area = raw.get(key) or {}
        place = by_mbid.get(area.get("id") or "")
        if not place:
            continue
        entry = claims_by_place.setdefault(place.id, _place_shell(place))
        entry["claims"].append(
            {
                "source": "musicbrainz",
                "field": field,
                "area_mbid": area.get("id"),
                "area_name": area.get("name"),
            }
        )
    return list(claims_by_place.values())


def locality_from_wikidata(rows: list[dict]) -> list[dict]:
    by_qid = places_by_qid()
    claims_by_place: dict[str, dict] = {}
    for row in rows:
        place = by_qid.get(row.get("place_qid") or "")
        if not place:
            continue
        entry = claims_by_place.setdefault(place.id, _place_shell(place))
        claim = {
            "source": "wikidata",
            "field": row.get("claim"),
            "wikidata_qid": row.get("place_qid"),
            "place_name": place.name,
        }
        if claim not in entry["claims"]:
            entry["claims"].append(claim)
    return list(claims_by_place.values())


def artist_record(raw: dict, mb_places: list[dict], wd_places: list[dict]) -> dict:
    merged = _merge_places(mb_places, wd_places)
    tags = []
    for tag in raw.get("tags") or []:
        name = tag.get("name") if isinstance(tag, dict) else str(tag)
        if name and name not in tags:
            tags.append(name)
    life = raw.get("life-span") or {}
    return {
        "mbid": raw.get("id"),
        "wikidata_qid": raw.get("wikidata_qid"),
        "name": raw.get("name"),
        "sort_name": raw.get("sort-name") or raw.get("name"),
        "type": raw.get("type"),
        "disambiguation": raw.get("disambiguation"),
        "country": raw.get("country"),
        "life_span": {
            "begin": life.get("begin"),
            "end": life.get("end"),
            "ended": life.get("ended"),
            "source": "musicbrainz" if life.get("begin") or life.get("end") else None,
        },
        "tags": tags,
        "musicbrainz": {
            "area": _area_brief(raw.get("area")),
            "begin_area": _area_brief(raw.get("begin-area")),
        },
        "locality": merged,
    }


def is_musical(record: dict, releases_for) -> bool:
    artist_type = (record.get("type") or "").casefold()
    if artist_type == "character":
        return False
    if artist_type in GROUP_TYPES:
        return True
    tags = {tag.casefold() for tag in record.get("tags") or []}
    if tags & MUSIC_TAGS:
        return True
    comment = (record.get("disambiguation") or "").casefold()
    if any(phrase in comment for phrase in MUSIC_COMMENT_PHRASES):
        return True
    if any(phrase in comment for phrase in NON_MUSIC_COMMENT_PHRASES):
        return False
    mbid = record.get("mbid")
    if not mbid:
        return False
    return has_musical_release(releases_for(mbid))


def usable_name(name: str | None) -> bool:
    text = (name or "").strip()
    if re.fullmatch(r"Q\d+", text):
        return False
    return any(character.isalpha() for character in text)


def has_musical_release(release_groups: list[dict]) -> bool:
    for group in release_groups:
        primary = group.get("primary-type") or group.get("primary_type") or ""
        if str(primary).casefold() in MUSICAL_RELEASE_TYPES:
            return True
    return False


def _merge_places(mb_places: list[dict], wd_places: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for place in mb_places + wd_places:
        current = merged.get(place["place_id"])
        if current is None:
            merged[place["place_id"]] = {
                "place_id": place["place_id"],
                "place_name": place["place_name"],
                "postcodes": list(place["postcodes"]),
                "precision": place["precision"],
                "claims": list(place["claims"]),
            }
            continue
        for claim in place["claims"]:
            if claim not in current["claims"]:
                current["claims"].append(claim)
    return list(merged.values())


def _place_shell(place: Place) -> dict:
    return {
        "place_id": place.id,
        "place_name": place.name,
        "postcodes": list(place.postcodes),
        "precision": place.precision,
        "claims": [],
    }


def _area_brief(area: dict | None) -> dict | None:
    if not area:
        return None
    return {"id": area.get("id"), "name": area.get("name"), "type": area.get("type")}


def _flat(rows: list[dict], key: str) -> list:
    values = []
    for row in rows:
        for item in row.get(key) or []:
            if item not in values:
                values.append(item)
    return values


def _looks_like_group(rows: list[dict]) -> bool:
    return has_specific_music_role({"occupations": [], "instance_of": _flat(rows, "instance_of")})


def attach_wikidata_qids(artists: list[dict], rows: list[dict]) -> None:
    by_mbid = {}
    for row in rows:
        if row.get("mbid") and row.get("qid"):
            by_mbid[row["mbid"]] = row
    for artist in artists:
        row = by_mbid.get(artist.get("mbid"))
        if row:
            artist["wikidata_qid"] = row["qid"]
            if row.get("name"):
                artist["_wikidata_name"] = row["name"]
