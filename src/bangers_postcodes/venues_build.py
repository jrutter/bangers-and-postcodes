"""Build the London music-venue list.

Sources, in merge order:

- GLA Cultural Infrastructure Map music venues, grassroots venues, and
  nightclubs (London Datastore, Open Government Licence). The 2024 music
  files are the performance-venue audit. The 2026 workbook is studios and
  other cultural production space, so it is not used here.
- OpenStreetMap via Overpass (ODbL): music venues, nightclubs, concert halls,
  and pubs, bars, theatres, and arts centres tagged live_music=yes, kept only
  when the point sits in a London borough.
- Skiddle venue search, only when SKIDDLE_API_KEY is set. Types are live
  music, nightclub, bar/pub, theatre, and outdoor. There is no key in this
  environment unless the caller passes one.

Rows for the same room are merged by normalised name within about 0.15 miles.
Hand-checked southwest rooms then replace the matched row's identity.
"""

from __future__ import annotations

import csv
import os
import re
import time
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import httpx

from bangers_postcodes.build_london import LAD_URL, geometry_contains, outward_code, slug
from bangers_postcodes.curated_venues import CURATED_VENUES
from bangers_postcodes.musicbrainz import USER_AGENT

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
GLA_PAGE = "https://data.london.gov.uk/dataset/cultural-infrastructure-map-2023-23697"
GLA_FILES = {
    "gla-music": "https://data.london.gov.uk/download/23697/f08c8fa8-2614-403e-b27e-a75602d850fe/CIM%202024%20Music_Venues_All.csv",
    "gla-grassroots": "https://data.london.gov.uk/download/23697/eab4e955-60ad-46d6-8722-134ff53da94e/CIM%202024%20Music_Venues_Grassroots.csv",
    "gla-nightclub": "https://data.london.gov.uk/download/23697/16b47d81-cbcf-49a1-9e43-8ada18d726fd/CIM%202024%20Music_Nightclubs.csv",
}
OVERPASS_MIRRORS = (
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
OVERPASS_QUERIES = (
    """
[out:json][timeout:90][bbox:51.28,-0.51,51.69,0.33];
(
  nwr["amenity"="music_venue"];
  nwr["amenity"="nightclub"];
  nwr["amenity"="concert_hall"];
);
out center tags;
""".strip(),
    """
[out:json][timeout:90][bbox:51.28,-0.51,51.69,0.33];
(
  nwr["amenity"~"^(pub|bar|theatre|arts_centre)$"]["live_music"="yes"];
);
out center tags;
""".strip(),
)
SKIDDLE_URL = "https://www.skiddle.com/api/v1/venues/"
SKIDDLE_TYPES = ("L", "N", "B", "T", "O")
SKIDDLE_CENTRES = (
    (51.507, -0.128),
    (51.55, -0.06),
    (51.45, -0.05),
    (51.47, -0.25),
    (51.55, -0.28),
    (51.40, -0.20),
    (51.58, 0.08),
    (51.38, 0.05),
)
MERGE_MILES = 0.15
CURATED_MILES = 0.3
NEAREST_MILES = 0.8
CLOSED_NAMES = {"pryzm kingston"}
BOROUGH_IDS = {
    "city of london": "city-of-london",
    "kingston upon thames": "kingston-borough",
    "richmond upon thames": "richmond-borough",
    "wandsworth": "wandsworth-borough",
}


def build_venue_document(
    *,
    gla_rows: list[dict],
    osm_elements: list[dict],
    skiddle_rows: list[dict],
    districts: list[dict],
    boroughs: list[dict],
    places: list[dict],
    skiddle_included: bool,
) -> dict:
    """Merge the three sources into the committed venue document."""
    merged: list[dict] = []
    for row in gla_rows:
        _absorb(merged, row)
    for row in _osm_rows(osm_elements, boroughs):
        _absorb(merged, row)
    for row in skiddle_rows:
        _absorb(merged, row)
    merged = [row for row in merged if not _closed(row)]
    _apply_curated(merged)
    district_ids = {feature["id"] for feature in districts}
    for row in merged:
        _locate(row, districts, district_ids, boroughs, places)
        row["type"] = _venue_type(row)
        row["grassroots"] = "gla-grassroots" in row["sources"]
    venues = [_public_venue(row) for row in merged if row.get("latitude") is not None and row.get("name")]
    venues.sort(key=lambda venue: ((venue.get("borough") or "zzz").casefold(), venue["name"].casefold()))
    document = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "venue_count": len(venues),
        "skiddle_included": skiddle_included,
        "attribution": (
            "Music venues combine the GLA Cultural Infrastructure Map 2024 music, grassroots, and "
            "nightclub files (Open Government Licence; https://data.london.gov.uk/dataset/cultural-infrastructure-map-2023-23697) "
            "with OpenStreetMap (© OpenStreetMap contributors, ODbL; https://www.openstreetmap.org/copyright). "
            "Skiddle venues are added only when SKIDDLE_API_KEY is set. "
            "Ten southwest rooms were checked by hand in October 2026 and keep their own pages. "
            "Pryzm Kingston, 154 Clarence Street, KT1 1QP, is omitted because it closed in July 2025. "
            "Borough outlines used to drop points outside Greater London are ONS generalised boundaries (Open Government Licence) and are not shipped."
        ),
        "venues": venues,
    }
    return finalize_document(document)


def refresh_venues(*, http: httpx.Client | None = None, skiddle_key: str | None = None, progress=None) -> dict:
    """Download the sources and return the venue document. Does not write the file."""
    log = progress or (lambda message: None)
    owns = http is None
    client = http or httpx.Client(timeout=120.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
    try:
        gla_rows = _download_gla(client, log)
        osm_elements = _download_osm(client, log)
        boroughs = _download_boroughs(client, log)
        key = skiddle_key if skiddle_key is not None else os.environ.get("SKIDDLE_API_KEY", "")
        skiddle_rows = _download_skiddle(client, key.strip(), log) if key and key.strip() else []
        if not key or not key.strip():
            log("Skiddle venue search skipped: SKIDDLE_API_KEY is not set")
        districts = _load_json(DATA / "postcode-districts.json").get("features") or []
        places = _load_json(DATA / "places.json")
    finally:
        if owns:
            client.close()
    return build_venue_document(
        gla_rows=gla_rows,
        osm_elements=osm_elements,
        skiddle_rows=skiddle_rows,
        districts=districts,
        boroughs=boroughs,
        places=places if isinstance(places, list) else [],
        skiddle_included=bool(skiddle_rows),
    )


def gla_rows_from_csv(path: Path, source: str) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = []
        for raw in csv.DictReader(handle):
            row = _gla_row(raw, source)
            if row and not _closed(row):
                rows.append(row)
        return rows


def parse_skiddle_venues(body: dict) -> list[dict]:
    if not isinstance(body, dict):
        return []
    if body.get("error") in {1, "1", True}:
        message = body.get("errormessage") or "Skiddle rejected the venue search"
        raise RuntimeError(str(message))
    rows = []
    for item in body.get("results") or []:
        row = _skiddle_row(item)
        if row and not _closed(row):
            rows.append(row)
    return rows


def _download_gla(client: httpx.Client, log) -> list[dict]:
    rows = []
    for source, url in GLA_FILES.items():
        log(f"GLA {source}")
        response = client.get(url)
        response.raise_for_status()
        path = Path("/tmp") / f"{source}.csv"
        path.write_bytes(response.content)
        rows.extend(gla_rows_from_csv(path, source))
    log(f"  {len(rows)} GLA rows")
    return rows


def _download_osm(client: httpx.Client, log) -> list[dict]:
    elements: list[dict] = []
    seen: set[tuple[str, int]] = set()
    for index, query in enumerate(OVERPASS_QUERIES, start=1):
        batch = _overpass(client, query, log, index)
        for element in batch:
            key = (str(element.get("type")), int(element.get("id") or 0))
            if key in seen:
                continue
            seen.add(key)
            elements.append(element)
    log(f"  {len(elements)} OSM elements")
    return elements


def _overpass(client: httpx.Client, query: str, log, index: int) -> list[dict]:
    last_error = "no response"
    for attempt in range(1, 4):
        for mirror in OVERPASS_MIRRORS:
            log(f"OpenStreetMap query {index} via {mirror} (attempt {attempt})")
            try:
                response = client.post(mirror, data={"data": query})
            except httpx.HTTPError as exc:
                last_error = str(exc)
                continue
            if response.status_code != 200:
                last_error = f"{response.status_code} {response.text[:120]}"
                continue
            try:
                payload = response.json()
            except ValueError:
                last_error = "not json"
                continue
            elements = payload.get("elements")
            if isinstance(elements, list):
                return elements
            last_error = "empty"
        time.sleep(min(20, 4 * attempt))
    raise RuntimeError(f"Overpass query failed: {last_error}")


def _download_boroughs(client: httpx.Client, log) -> list[dict]:
    log("ONS borough outlines")
    response = client.get(LAD_URL)
    response.raise_for_status()
    geometries = []
    for feature in response.json().get("features") or []:
        code = str((feature.get("properties") or {}).get("LAD13CD") or "")
        name = str((feature.get("properties") or {}).get("LAD13NM") or "")
        if code.startswith("E09"):
            geometries.append({"name": name, "geometry": feature["geometry"]})
    if len(geometries) < 33:
        raise RuntimeError(f"Expected 33 London authorities, found {len(geometries)}")
    return geometries


def _download_skiddle(client: httpx.Client, api_key: str, log) -> list[dict]:
    found: dict[str, dict] = {}
    for venue_type in SKIDDLE_TYPES:
        for latitude, longitude in SKIDDLE_CENTRES:
            offset = 0
            while offset < 400:
                log(f"Skiddle type {venue_type} at {latitude:.2f},{longitude:.2f} offset {offset}")
                response = client.get(
                    SKIDDLE_URL,
                    params={
                        "api_key": api_key,
                        "latitude": latitude,
                        "longitude": longitude,
                        "radius": 12,
                        "type": venue_type,
                        "limit": 100,
                        "offset": offset,
                    },
                )
                if response.status_code >= 400:
                    raise RuntimeError(f"Skiddle venues {response.status_code}: {response.text[:200]}")
                batch = parse_skiddle_venues(response.json())
                for row in batch:
                    found[row["skiddle_id"]] = row
                if len(batch) < 100:
                    break
                offset += 100
                time.sleep(0.3)
            time.sleep(0.2)
    log(f"  {len(found)} Skiddle venues")
    return list(found.values())


def _gla_row(raw: dict, source: str) -> dict | None:
    name = _clean(raw.get("name"))
    latitude = _float(raw.get("latitude"))
    longitude = _float(raw.get("longitude"))
    if not name or latitude is None or longitude is None:
        return None
    address = _address(raw.get("address1"), raw.get("address2"), raw.get("address3"))
    return {
        "name": name,
        "address": address,
        "postcode": _postcode_in(address),
        "latitude": latitude,
        "longitude": longitude,
        "borough": _clean(raw.get("borough_name") or raw.get("borough")),
        "website": _https(raw.get("website")),
        "capacity": None,
        "osm_amenity": None,
        "sources": [source],
        "aliases": [],
        "skiddle_id": None,
    }


def _osm_rows(elements: list[dict], boroughs: list[dict]) -> list[dict]:
    rows = []
    for element in elements:
        tags = element.get("tags") or {}
        if tags.get("disused") == "yes" or any(key.startswith("disused:") for key in tags):
            continue
        name = _clean(tags.get("name"))
        point = _osm_point(element)
        if not name or point is None:
            continue
        longitude, latitude = point
        if boroughs and not _borough_at(boroughs, longitude, latitude):
            continue
        address = _address(
            " ".join(part for part in (tags.get("addr:housenumber"), tags.get("addr:street")) if part),
            tags.get("addr:city") or tags.get("addr:suburb"),
        )
        rows.append(
            {
                "name": name,
                "address": address,
                "postcode": _postcode_in(tags.get("addr:postcode") or "") or _postcode_in(address),
                "latitude": latitude,
                "longitude": longitude,
                "borough": None,
                "website": _https(tags.get("website") or tags.get("contact:website")),
                "capacity": _capacity(tags.get("capacity")),
                "osm_amenity": tags.get("amenity"),
                "sources": ["openstreetmap"],
                "aliases": [alias for alias in (tags.get("alt_name"), tags.get("official_name")) if alias],
                "skiddle_id": None,
            }
        )
    return rows


def _skiddle_row(item: dict) -> dict | None:
    if not isinstance(item, dict):
        return None
    name = _clean(item.get("name"))
    latitude = _float(item.get("latitude"))
    longitude = _float(item.get("longitude"))
    skiddle_id = str(item.get("id") or "").strip()
    if not name or latitude is None or longitude is None or not skiddle_id:
        return None
    address = _address(item.get("address"), item.get("town"))
    kind = str(item.get("type") or "").strip().upper()
    amenity = {"N": "nightclub", "B": "pub", "T": "theatre", "L": "music_venue", "O": "music_venue"}.get(kind)
    return {
        "name": name,
        "address": address,
        "postcode": _postcode_in(str(item.get("postcode") or "")) or _postcode_in(address),
        "latitude": latitude,
        "longitude": longitude,
        "borough": None,
        "website": _https(item.get("website") or item.get("link")),
        "capacity": _capacity(item.get("capacity")),
        "osm_amenity": amenity,
        "sources": ["skiddle"],
        "aliases": [],
        "skiddle_id": skiddle_id,
    }


def _absorb(merged: list[dict], row: dict) -> None:
    if _closed(row):
        return
    for existing in merged:
        if _same_room(existing, row):
            _merge_row(existing, row)
            return
    merged.append({**row, "sources": list(row.get("sources") or []), "aliases": list(row.get("aliases") or [])})


def _same_room(left: dict, right: dict) -> bool:
    distance = _miles(left, right)
    left_name = _norm(left.get("name"))
    right_name = _norm(right.get("name"))
    if not left_name or not right_name:
        return False
    if left_name == right_name and len(left_name) >= 8 and distance <= 0.35:
        return True
    if distance > MERGE_MILES:
        return False
    if left_name == right_name:
        return True
    names = {left_name, *(_norm(alias) for alias in left.get("aliases") or [])}
    return right_name in names


def _merge_row(existing: dict, extra: dict) -> None:
    for source in extra.get("sources") or []:
        if source not in existing["sources"]:
            existing["sources"].append(source)
    for alias in extra.get("aliases") or []:
        if alias not in existing["aliases"]:
            existing["aliases"].append(alias)
    if not existing.get("website") and extra.get("website"):
        existing["website"] = extra["website"]
    if not existing.get("postcode") and extra.get("postcode"):
        existing["postcode"] = extra["postcode"]
    if not existing.get("address") and extra.get("address"):
        existing["address"] = extra["address"]
    if not existing.get("borough") and extra.get("borough"):
        existing["borough"] = extra["borough"]
    if existing.get("capacity") is None and extra.get("capacity") is not None:
        existing["capacity"] = extra["capacity"]
    if not existing.get("osm_amenity") and extra.get("osm_amenity"):
        existing["osm_amenity"] = extra["osm_amenity"]
    if not existing.get("skiddle_id") and extra.get("skiddle_id"):
        existing["skiddle_id"] = extra["skiddle_id"]


def _apply_curated(merged: list[dict]) -> None:
    used = set()
    for curated in CURATED_VENUES:
        match = None
        for index, row in enumerate(merged):
            if index in used:
                continue
            if _curated_match(curated, row):
                match = index
                break
        if match is None:
            merged.append(_from_curated(curated))
            continue
        used.add(match)
        row = merged[match]
        if "curated" not in row["sources"]:
            row["sources"].append("curated")
        row["curated"] = curated
    for curated in CURATED_VENUES:
        if any(row.get("curated", {}).get("id") == curated["id"] for row in merged):
            continue
        merged.append(_from_curated(curated))


def _from_curated(curated: dict) -> dict:
    return {
        "name": curated["name"],
        "address": curated["address"],
        "postcode": curated["postcode"],
        "latitude": curated["latitude"],
        "longitude": curated["longitude"],
        "borough": None,
        "website": curated["website"],
        "capacity": None,
        "osm_amenity": None,
        "sources": ["curated"],
        "aliases": list(curated["aliases"]),
        "skiddle_id": None,
        "curated": curated,
    }


def _curated_match(curated: dict, row: dict) -> bool:
    if _miles(curated, row) > CURATED_MILES:
        return False
    wanted = {_norm(curated["name"]), *(_norm(alias) for alias in curated["aliases"])}
    wanted.discard("")
    candidate = {_norm(row.get("name")), *(_norm(alias) for alias in row.get("aliases") or [])}
    candidate.discard("")
    if wanted & candidate:
        return True
    row_name = _norm(row.get("name"))
    for name in wanted:
        if len(name) >= 8 and name in row_name:
            return True
    return False


def _locate(row: dict, districts: list[dict], district_ids: set[str], boroughs: list[dict], places: list[dict]) -> None:
    curated = row.get("curated") or {}
    longitude = float(curated.get("longitude", row["longitude"]))
    latitude = float(curated.get("latitude", row["latitude"]))
    row["longitude"] = longitude
    row["latitude"] = latitude
    district = _district_at(districts, longitude, latitude)
    stated = outward_code(curated.get("postcode") or row.get("postcode"))
    if stated and stated not in district_ids:
        stated = None
    if district is None and stated:
        district = stated
    if district is None:
        district = _nearest_district(districts, longitude, latitude)
    borough_name = curated.get("borough") or row.get("borough") or _borough_at(boroughs, longitude, latitude)
    if borough_name == "City of London":
        borough_id = "city-of-london"
    else:
        borough_id = BOROUGH_IDS.get(str(borough_name or "").casefold()) or (
            f"{slug(borough_name)}-borough" if borough_name else None
        )
    area_ids = list(curated.get("areaIds") or [])
    if borough_id and borough_id not in area_ids:
        area_ids.append(borough_id)
    if district:
        for place in places:
            if place.get("precision") == "place" and district in (place.get("postcodes") or []):
                if place["id"] not in area_ids:
                    area_ids.append(place["id"])
    postcodes = list(curated.get("postcodes") or [])
    if district and district not in postcodes:
        postcodes.append(district)
    row["postcode_district"] = district
    row["borough"] = borough_name
    row["borough_id"] = borough_id
    row["postcodes"] = postcodes
    row["area_ids"] = area_ids
    if curated:
        row["id"] = curated["id"]
        row["name"] = curated["name"]
        row["address"] = curated["address"]
        row["postcode"] = curated["postcode"]
        row["website"] = curated["website"]
        row["note"] = curated["note"]
        row["aliases"] = list(dict.fromkeys([*curated["aliases"], *row.get("aliases", [])]))
        row["forced_type"] = curated["type"]
    else:
        row["id"] = None
        row["note"] = _note(row)
        row["forced_type"] = None


def _public_venue(row: dict) -> dict:
    district = row.get("postcode_district")
    venue_id = row.get("id") or _unique_id(row)
    postcode = row.get("postcode") or district or ""
    return {
        "id": venue_id,
        "name": row["name"],
        "address": row.get("address") or "",
        "postcode": postcode,
        "postcodeDistrict": district,
        "borough": row.get("borough"),
        "boroughId": row.get("borough_id"),
        "latitude": round(float(row["latitude"]), 5),
        "longitude": round(float(row["longitude"]), 5),
        "postcodes": row.get("postcodes") or ([district] if district else []),
        "areaIds": row.get("area_ids") or [],
        "aliases": row.get("aliases") or [],
        "website": row.get("website"),
        "note": row.get("note") or "",
        "type": row.get("type") or "music-venue",
        "grassroots": bool(row.get("grassroots")),
        "capacity": row.get("capacity"),
        "sources": row.get("sources") or [],
        "curated": bool(row.get("curated")),
    }


def _unique_id(row: dict) -> str:
    # Filled in a second pass if needed. The caller replaces collisions.
    base = slug(row["name"])
    district = row.get("postcode_district")
    return f"{base}-{district.lower()}" if district else base


def assign_venue_ids(venues: list[dict]) -> None:
    """Give generated rooms a stable id that does not collide with a curated id."""
    used = {venue["id"] for venue in venues if venue.get("curated")}
    for venue in venues:
        if venue.get("curated"):
            continue
        base = slug(venue["name"])
        district = (venue.get("postcodeDistrict") or "").lower()
        candidate = f"{base}-{district}" if district else base
        if candidate in used:
            suffix = 2
            while f"{candidate}-{suffix}" in used:
                suffix += 1
            candidate = f"{candidate}-{suffix}"
        venue["id"] = candidate
        used.add(candidate)


def _venue_type(row: dict) -> str:
    if row.get("forced_type"):
        return row["forced_type"]
    name = row.get("name") or ""
    amenity = row.get("osm_amenity") or ""
    if re.search(r"\b(arena|stadium)\b", name, re.I):
        return "arena"
    if amenity == "theatre" or re.search(r"\btheat(re|er)\b", name, re.I):
        return "theatre"
    if amenity == "concert_hall" or re.search(r"\bconcert hall\b", name, re.I):
        return "concert-hall"
    if amenity == "arts_centre" or re.search(r"\barts cent(re|er)\b", name, re.I):
        return "arts-centre"
    if amenity == "nightclub" or "gla-nightclub" in (row.get("sources") or []):
        return "club"
    if amenity == "pub" or re.search(r"\b(pub|tavern|inn)\b", name, re.I):
        return "pub"
    if amenity == "bar":
        return "bar"
    if "gla-grassroots" in (row.get("sources") or []):
        return "grassroots"
    return "music-venue"


def _note(row: dict) -> str:
    district = row.get("postcode_district") or "London"
    kind = (row.get("forced_type") or _venue_type(row)).replace("-", " ")
    return f"{kind.capitalize()} in {district}, from the open venue sources."


def _district_at(districts: list[dict], longitude: float, latitude: float) -> str | None:
    hits = []
    for feature in districts:
        geometry = feature.get("geometry")
        if geometry and geometry_contains(geometry, longitude, latitude):
            hits.append(feature)
    if not hits:
        return None
    hits.sort(key=lambda feature: _bbox_area(feature["geometry"]))
    return hits[0].get("id") or (hits[0].get("properties") or {}).get("postcode")


def _nearest_district(districts: list[dict], longitude: float, latitude: float) -> str | None:
    best = None
    best_miles = NEAREST_MILES
    for feature in districts:
        props = feature.get("properties") or {}
        code = feature.get("id") or props.get("postcode")
        point = feature.get("latitude"), feature.get("longitude")
        if point[0] is None:
            ring = _largest_ring(feature.get("geometry") or {})
            if not ring:
                continue
            point = (
                sum(item[1] for item in ring) / len(ring),
                sum(item[0] for item in ring) / len(ring),
            )
        distance = _miles({"latitude": latitude, "longitude": longitude}, {"latitude": point[0], "longitude": point[1]})
        if distance < best_miles:
            best = code
            best_miles = distance
    return best


def _borough_at(boroughs: list[dict], longitude: float, latitude: float) -> str | None:
    for borough in boroughs:
        if geometry_contains(borough["geometry"], longitude, latitude):
            return borough["name"]
    return None


def _closed(row: dict) -> bool:
    name = _norm(row.get("name"))
    if name in CLOSED_NAMES:
        return True
    address = _norm(row.get("address"))
    return "154 clarence" in address and "pryzm" in name


def _norm(value: str | None) -> str:
    text = (value or "").replace("\xa0", " ").casefold().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\bthe\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).replace("\xa0", " ").strip()
    text = re.sub(r"\s+", " ", text)
    return text or None


def _address(*parts: str | None) -> str:
    seen = []
    for part in parts:
        text = _clean(part)
        if not text:
            continue
        if any(text.casefold() == existing.casefold() for existing in seen):
            continue
        seen.append(text)
    return ", ".join(seen)


def _postcode_in(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b", value.upper())
    if not match:
        return None
    return f"{match.group(1)} {match.group(2)}"


def _https(value: str | None) -> str | None:
    text = _clean(value)
    if not text:
        return None
    if text.startswith("http://"):
        text = "https://" + text[len("http://") :]
    if not text.startswith("https://"):
        return None
    return text


def _capacity(value) -> int | None:
    if value is None or value == "":
        return None
    match = re.search(r"\d+", str(value))
    if not match:
        return None
    number = int(match.group(0))
    return number if number > 0 else None


def _float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _miles(left: dict, right: dict) -> float:
    lat1 = radians(float(left["latitude"]))
    lat2 = radians(float(right["latitude"]))
    dlat = radians(float(right["latitude"]) - float(left["latitude"]))
    dlon = radians(float(right["longitude"]) - float(left["longitude"]))
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * 3958.8 * asin(min(1, sqrt(h)))


def _bbox_area(geometry: dict) -> float:
    ring = _largest_ring(geometry)
    if not ring:
        return 0.0
    xs = [point[0] for point in ring]
    ys = [point[1] for point in ring]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def _largest_ring(geometry: dict) -> list:
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    polygons = coordinates if kind == "MultiPolygon" else [coordinates]
    rings = [polygon[0] for polygon in polygons if polygon]
    if not rings:
        return []
    return max(rings, key=len)


def _osm_point(element: dict) -> tuple[float, float] | None:
    if element.get("type") == "node" and element.get("lon") is not None and element.get("lat") is not None:
        return float(element["lon"]), float(element["lat"])
    center = element.get("center") or {}
    if center.get("lon") is not None and center.get("lat") is not None:
        return float(center["lon"]), float(center["lat"])
    return None


def _load_json(path: Path):
    import json

    return json.loads(path.read_text())


def finalize_document(document: dict) -> dict:
    assign_venue_ids(document["venues"])
    document["venue_count"] = len(document["venues"])
    return document
