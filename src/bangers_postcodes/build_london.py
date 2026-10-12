"""Build the London place list and postcode-district shapes.

District polygons are the Wikipedia KML files republished by
uk-postcode-polygons (CC BY-SA 3.0). A district is kept when the centre of its
outer ring sits inside a London borough, using the ONS generalised local
authority boundaries (Open Government Licence) only as that filter. The
boundary file is not shipped.

Place records come from Wikidata items that have a MusicBrainz area id and
sit in a London borough or the City of London. Postcodes are the district
that contains the place's coordinates. Borough-level records have no postcode.
The hand-checked southwest places in areas.CURATED keep their ids and postcodes.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

import httpx

from bangers_postcodes.areas import CURATED, Place
from bangers_postcodes.musicbrainz import USER_AGENT, MusicBrainzClient

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
POLYGON_URL = "https://raw.githubusercontent.com/missinglink/uk-postcode-polygons/master/geojson/{code}.geojson"
LAD_URL = "https://raw.githubusercontent.com/martinjc/UK-GeoJSON/master/json/administrative/eng/lad.json"
SPARQL_URL = "https://query.wikidata.org/sparql"
PREFIXES = (
    "E",
    "EC",
    "N",
    "NW",
    "SE",
    "SW",
    "W",
    "WC",
    "BR",
    "CR",
    "DA",
    "EN",
    "HA",
    "IG",
    "KT",
    "RM",
    "SM",
    "TW",
    "UB",
    "WD",
)

# Resolved from Wikidata on 11 October 2026. 32 London boroughs plus the City.
BOROUGHS: tuple[dict, ...] = (
    {"qid": "Q205358", "name": "Barking and Dagenham", "mbid": "b5f9b558-9f45-4710-a3cf-0366e92800f8"},
    {"qid": "Q151048", "name": "Barnet", "mbid": "f6fc8acf-4acb-4179-b9cb-36612e1c15a6"},
    {"qid": "Q207208", "name": "Bexley", "mbid": "a13062f4-aa93-4888-a524-4f9bf7016731"},
    {"qid": "Q207201", "name": "Brent", "mbid": "2649ce9e-919e-48c0-abc7-c04983835b17"},
    {"qid": "Q208201", "name": "Bromley", "mbid": "71d7ce55-816c-4e64-8dbf-e2289a696354"},
    {"qid": "Q202088", "name": "Camden", "mbid": "627f7b90-32b6-4bc6-b11e-ee1d86ca1cd7"},
    {"qid": "Q23311", "name": "City of London", "mbid": "817a3404-240e-49c0-b799-21bf578b3991", "city": True},
    {"qid": "Q26888", "name": "Croydon", "mbid": "77bd9218-74c6-4881-9495-457be4ba62e7"},
    {"qid": "Q207218", "name": "Ealing", "mbid": "8bcd4274-68a9-4a13-a754-c9e4e2aaddaf"},
    {"qid": "Q210531", "name": "Enfield", "mbid": "11518382-04c9-473d-98d6-2c0f4b2b9bd9"},
    {"qid": "Q693450", "name": "Greenwich", "mbid": "4020f085-9caf-433d-b8aa-2ee86f0c7589"},
    {"qid": "Q205679", "name": "Hackney", "mbid": "76325eca-c006-429f-93bb-d499ae80916c"},
    {"qid": "Q40478", "name": "Hammersmith and Fulham", "mbid": "3c254244-166a-474c-85b5-938698ebbf28"},
    {"qid": "Q213560", "name": "Haringey", "mbid": "cd46362d-4a6e-429e-a970-c3a0134e0b10"},
    {"qid": "Q210476", "name": "Harrow", "mbid": "40868657-ef80-4b66-88ba-263ecac1b9a1"},
    {"qid": "Q215038", "name": "Havering", "mbid": "b60bfcef-e8b5-4e56-b229-d5f4cd9fc1c5"},
    {"qid": "Q205690", "name": "Hillingdon", "mbid": "ad54b599-b125-4bcd-b4bf-f85c96c2b181"},
    {"qid": "Q214162", "name": "Hounslow", "mbid": "58019cb6-8fbe-4bd4-bd56-3b2e71128d07"},
    {"qid": "Q205817", "name": "Islington", "mbid": "e3b25e1c-0adf-4773-820e-533b4f245d01"},
    {"qid": "Q188801", "name": "Kensington and Chelsea", "mbid": "b9576171-3434-4d1b-8883-165ed6e65d2f"},
    {"qid": "Q32508", "name": "Kingston upon Thames", "mbid": "5d9d8e13-c62b-4fe8-8f18-7b22346a7ed8"},
    {"qid": "Q202059", "name": "Lambeth", "mbid": "6f34ea39-ca6c-4982-9731-3a5c7a0edf36"},
    {"qid": "Q215030", "name": "Lewisham", "mbid": "7c17c50a-8faf-42f4-83f7-0a42bc0091e0"},
    {"qid": "Q32504", "name": "Merton", "mbid": "e3f0a43a-ceaf-4784-93ea-5a261e0e2b94"},
    {"qid": "Q208139", "name": "Newham", "mbid": "98249400-1065-41c3-a29b-49901d552006"},
    {"qid": "Q208955", "name": "Redbridge", "mbid": "c6ef13de-878d-42f7-a566-04f0c8ac1159"},
    {"qid": "Q32515", "name": "Richmond upon Thames", "mbid": "be0308c4-9c83-4e19-8cb7-33d3fb54d32f"},
    {"qid": "Q730706", "name": "Southwark", "mbid": "badaf213-5136-4c04-84ec-d5ad5be6537d"},
    {"qid": "Q320378", "name": "Sutton", "mbid": "1a7ebbac-d318-469f-bd69-1a88107189a3"},
    {"qid": "Q208152", "name": "Tower Hamlets", "mbid": "0597b915-cb5c-454e-9d6f-7cfffd69b0f6"},
    {"qid": "Q40608", "name": "Waltham Forest", "mbid": "16dc51f3-ec54-4c74-a8dd-3510829049db"},
    {"qid": "Q210563", "name": "Wandsworth", "mbid": "54181a4b-9f77-4919-b8c5-f7af03fbbe17"},
    {"qid": "Q179351", "name": "Westminster", "mbid": "48d08ee1-db45-4566-bb1d-c47ab6dbaf98"},
)


def ring_contains(ring: list, x: float, y: float) -> bool:
    inside = False
    j = len(ring) - 1
    for i, point in enumerate(ring):
        xi, yi = point[0], point[1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def geometry_contains(geometry: dict, x: float, y: float) -> bool:
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    polygons = coordinates if kind == "MultiPolygon" else [coordinates]
    for polygon in polygons:
        if not polygon:
            continue
        if ring_contains(polygon[0], x, y) and not any(ring_contains(hole, x, y) for hole in polygon[1:]):
            return True
    return False


def simplify_ring(points: list, epsilon: float) -> list:
    if len(points) < 5:
        return _round_ring(points)
    closed = points[0] == points[-1]
    core = points[:-1] if closed else list(points)
    simplified = _rdp(core, epsilon)
    if len(simplified) < 3:
        simplified = core
    rounded = _round_ring(simplified)
    if closed and rounded[0] != rounded[-1]:
        rounded.append(rounded[0])
    return rounded


def outward_code(value: str | None) -> str | None:
    if not value:
        return None
    compact = re.sub(r"[^A-Z0-9]", "", value.upper())
    full = re.fullmatch(r"([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})", compact)
    if full:
        return full.group(1)
    if re.fullmatch(r"[A-Z]{1,2}\d[A-Z\d]?", compact):
        return compact
    return None


def slug(name: str) -> str:
    text = name.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "place"


def build_london(*, http: httpx.Client | None = None, mb: MusicBrainzClient | None = None, progress=None) -> dict:
    log = progress or (lambda message: None)
    owns_http = http is None
    client = http or httpx.Client(timeout=90.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
    owns_mb = mb is None
    musicbrainz = mb or MusicBrainzClient(cache_dir=DATA / ".mb-cache")
    try:
        districts = _london_districts(client, log)
        places = _places(client, musicbrainz, districts, log)
    finally:
        if owns_http:
            client.close()
        if owns_mb:
            musicbrainz.close()
    _write_outputs(districts, places)
    return {"districts": len(districts), "places": len(places)}


def _london_districts(client: httpx.Client, log) -> list[dict]:
    log("Loading Greater London borough outlines")
    boroughs = _borough_geometries(client)
    kept = []
    for prefix in PREFIXES:
        log(f"Postcode polygons {prefix}")
        payload = _download_json(client, POLYGON_URL.format(code=prefix))
        for feature in payload.get("features") or []:
            name = (feature.get("properties") or {}).get("name")
            geometry = feature.get("geometry") or {}
            if not name or not _district_in_london(geometry, boroughs):
                continue
            simplified = _simplify_geometry(geometry)
            longitude, latitude = _ring_centre(_largest_ring(simplified))
            kept.append(
                {
                    "type": "Feature",
                    "id": name,
                    "properties": {"postcode": name, "description": f"{name} postcode district"},
                    "geometry": simplified,
                    "latitude": round(latitude, 5),
                    "longitude": round(longitude, 5),
                }
            )
    kept.sort(key=lambda feature: feature["id"])
    log(f"  {len(kept)} districts inside Greater London")
    return kept


def _places(client: httpx.Client, musicbrainz: MusicBrainzClient, districts: list[dict], log) -> list[dict]:
    by_mbid = {place.musicbrainz_area_mbid: place for place in CURATED if place.musicbrainz_area_mbid}
    by_qid = {place.wikidata_qid: place for place in CURATED if place.wikidata_qid}
    found: dict[str, dict] = {}
    for borough in BOROUGHS:
        found[borough["mbid"]] = {
            "qid": borough["qid"],
            "name": borough["name"],
            "mbid": borough["mbid"],
            "precision": "borough",
            "borough": borough["name"],
            "postcode": None,
            "longitude": None,
            "latitude": None,
            "city": borough.get("city", False),
        }
        log(f"Wikidata places in {borough['name']}")
        for row in _child_places(client, borough["qid"]):
            mbid = row["mbid"]
            if mbid in found:
                continue
            longitude, latitude = _parse_point(row.get("point"))
            found[mbid] = {
                "qid": row["qid"],
                "name": row["name"],
                "mbid": mbid,
                "precision": "place",
                "borough": borough["name"],
                "postcode": outward_code(row.get("postcode")),
                "longitude": longitude,
                "latitude": latitude,
                "city": False,
            }
        time.sleep(0.4)

    log(f"Resolving MusicBrainz area names for {len(found)} places")
    districts_by_id = {feature["id"]: feature for feature in districts}
    places = []
    used_ids = set()
    for mbid, row in found.items():
        curated = by_mbid.get(mbid) or by_qid.get(row["qid"])
        try:
            area = musicbrainz.get(f"/area/{mbid}", {"fmt": "json"})
            area_name = area.get("name") or row["name"]
        except Exception as exc:  # noqa: BLE001 — keep the Wikidata label if MusicBrainz has no area
            log(f"  area {mbid} lookup failed: {exc}")
            area_name = row["name"]
        if curated:
            place_id = curated.id
            name = curated.name
            postcodes = list(curated.postcodes)
            precision = curated.precision
            note = curated.note
            area_name = curated.musicbrainz_area_name or area_name
        else:
            place_id = _unique_id(row, used_ids)
            name = row["name"]
            precision = row["precision"]
            postcodes = _postcodes_for(row, districts)
            note = _note(row, postcodes)
        used_ids.add(place_id)
        places.append(
            Place(
                id=place_id,
                name=name,
                postcodes=tuple(postcodes),
                precision=precision,
                musicbrainz_area_mbid=mbid,
                musicbrainz_area_name=area_name,
                wikidata_qid=row["qid"],
                note=note,
            ).to_dict()
        )
    for curated in CURATED:
        if curated.id in used_ids:
            continue
        used_ids.add(curated.id)
        places.append(curated.to_dict())
    places.sort(key=lambda place: (place["precision"] != "borough", place["name"].casefold()))
    # districts_by_id is used by _postcodes_for via the districts list.
    del districts_by_id
    return places


def _postcodes_for(row: dict, districts: list[dict]) -> list[str]:
    if row["precision"] != "place":
        return []
    codes: list[str] = []
    longitude, latitude = row.get("longitude"), row.get("latitude")
    if isinstance(longitude, float) and isinstance(latitude, float):
        hits = []
        for feature in districts:
            if geometry_contains(feature["geometry"], longitude, latitude):
                hits.append(feature)
        if hits:
            hits.sort(key=lambda feature: _bbox_area(feature["geometry"]))
            codes.append(hits[0]["id"])
    stated = row.get("postcode")
    if stated and any(feature["id"] == stated for feature in districts) and stated not in codes:
        codes.append(stated)
    return codes[:3]


def _note(row: dict, postcodes: list[str]) -> str:
    if row.get("city"):
        return (
            "City of London. Artists linked only here are not forced into one postcode district. "
            "The City sits alongside the 32 London boroughs."
        )
    if row["precision"] == "borough":
        return (
            f"London Borough of {row['name']}. Artists tagged only at borough level stay off the postcode "
            "totals, because a borough is wider than one district."
        )
    where = ", ".join(postcodes) if postcodes else "no single district"
    return (
        f"{row['name']} in {row['borough']}. The postcode ({where}) is the district containing this place's "
        "published coordinates. Borough-only links stay on the borough page."
    )


def _unique_id(row: dict, used: set[str]) -> str:
    base = slug(row["name"])
    if row["precision"] == "borough":
        base = "city-of-london" if row.get("city") else f"{base}-borough"
    candidate = base
    suffix = 2
    while candidate in used:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def _child_places(client: httpx.Client, qid: str) -> list[dict]:
    query = f"""
SELECT ?item ?itemLabel ?mbid (SAMPLE(?code) AS ?postcode) (SAMPLE(?coord) AS ?point) WHERE {{
  ?item wdt:P982 ?mbid .
  ?item wdt:P131+ wd:{qid} .
  FILTER(?item != wd:{qid})
  OPTIONAL {{ ?item wdt:P281 ?code }}
  OPTIONAL {{ ?item wdt:P625 ?coord }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}} GROUP BY ?item ?itemLabel ?mbid
""".strip()
    response = None
    for attempt in range(4):
        response = client.get(
            SPARQL_URL,
            params={"query": query},
            headers={"Accept": "application/sparql-results+json"},
        )
        if response.status_code < 500 and "timeout" not in response.text[:80].lower():
            break
        time.sleep(2 * (attempt + 1))
    if response is None or response.status_code >= 400:
        detail = response.text[:200] if response is not None else "no response"
        raise RuntimeError(f"Wikidata places for {qid} failed: {detail}")
    rows = []
    for binding in response.json()["results"]["bindings"]:
        rows.append(
            {
                "qid": binding["item"]["value"].rsplit("/", 1)[-1],
                "name": binding["itemLabel"]["value"],
                "mbid": binding["mbid"]["value"],
                "postcode": (binding.get("postcode") or {}).get("value"),
                "point": (binding.get("point") or {}).get("value"),
            }
        )
    return rows


def _borough_geometries(client: httpx.Client) -> list[dict]:
    payload = _download_json(client, LAD_URL)
    geometries = []
    for feature in payload.get("features") or []:
        code = str((feature.get("properties") or {}).get("LAD13CD") or "")
        if code.startswith("E09"):
            geometries.append(feature["geometry"])
    if len(geometries) < 33:
        raise RuntimeError(f"Expected 33 London authorities in the ONS file, found {len(geometries)}")
    return geometries


def _district_in_london(geometry: dict, boroughs: list[dict]) -> bool:
    ring = _largest_ring(geometry)
    if len(ring) < 3:
        return False
    longitude = sum(point[0] for point in ring) / len(ring)
    latitude = sum(point[1] for point in ring) / len(ring)
    if any(geometry_contains(borough, longitude, latitude) for borough in boroughs):
        return True
    sample = ring[:: max(1, len(ring) // 40)]
    inside = sum(1 for point in sample if any(geometry_contains(borough, point[0], point[1]) for borough in boroughs))
    return inside / len(sample) >= 0.55


def _download_json(client: httpx.Client, url: str) -> dict:
    response = client.get(url)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError(f"Unexpected payload from {url}")
    return payload


def _simplify_geometry(geometry: dict) -> dict:
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    if kind == "Polygon":
        return {"type": "Polygon", "coordinates": [_simplify_or_keep(ring) for ring in coordinates]}
    if kind == "MultiPolygon":
        return {
            "type": "MultiPolygon",
            "coordinates": [[_simplify_or_keep(ring) for ring in polygon] for polygon in coordinates],
        }
    raise RuntimeError(f"Unsupported geometry {kind}")


def _simplify_or_keep(ring: list) -> list:
    simplified = simplify_ring(ring, 0.0008)
    if len(simplified) < 4:
        return _round_ring(ring)
    return simplified


def _largest_ring(geometry: dict) -> list:
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    polygons = coordinates if kind == "MultiPolygon" else [coordinates]
    rings = [polygon[0] for polygon in polygons if polygon]
    if not rings:
        return []
    return max(rings, key=len)


def _ring_centre(ring: list) -> tuple[float, float]:
    if not ring:
        return 0.0, 0.0
    return sum(point[0] for point in ring) / len(ring), sum(point[1] for point in ring) / len(ring)


def _bbox_area(geometry: dict) -> float:
    ring = _largest_ring(geometry)
    if not ring:
        return 0.0
    xs = [point[0] for point in ring]
    ys = [point[1] for point in ring]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def _parse_point(value: str | None) -> tuple[float | None, float | None]:
    if not value:
        return None, None
    match = re.search(r"Point\(([-\d.]+)\s+([-\d.]+)\)", value)
    if not match:
        return None, None
    return float(match.group(1)), float(match.group(2))


def _round_ring(points: list) -> list:
    rounded = [[round(point[0], 5), round(point[1], 5)] for point in points]
    if rounded and rounded[0] != rounded[-1]:
        rounded.append(rounded[0])
    return rounded


def _rdp(points: list, epsilon: float) -> list:
    if len(points) < 3:
        return list(points)
    start, end = points[0], points[-1]
    worst_index = 0
    worst = 0.0
    for index in range(1, len(points) - 1):
        distance = _perpendicular(points[index], start, end)
        if distance > worst:
            worst = distance
            worst_index = index
    if worst > epsilon and worst_index:
        left = _rdp(points[: worst_index + 1], epsilon)
        right = _rdp(points[worst_index:], epsilon)
        return left[:-1] + right
    return [start, end]


def _perpendicular(point, start, end) -> float:
    if start == end:
        return ((point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2) ** 0.5
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / ((dx * dx + dy * dy) ** 0.5)


def _write_outputs(districts: list[dict], places: list[dict]) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    collection = {
        "type": "FeatureCollection",
        "name": "Greater London postcode districts",
        "attribution": (
            "Postcode district boundaries are © Wikipedia contributors and available under CC BY-SA 3.0. "
            "Extracted from the Wikipedia KML files republished at https://github.com/missinglink/uk-postcode-polygons. "
            "Districts are those whose centre falls in Greater London, checked against ONS generalised "
            "local-authority boundaries (Open Government Licence)."
        ),
        "licence": "https://creativecommons.org/licenses/by-sa/3.0/",
        "features": [
            {
                "type": "Feature",
                "id": feature["id"],
                "properties": feature["properties"],
                "geometry": feature["geometry"],
            }
            for feature in districts
        ],
    }
    (DATA / "postcode-districts.json").write_text(json.dumps(collection, separators=(",", ":")) + "\n")
    centroids = [
        {"postcode": feature["id"], "latitude": feature["latitude"], "longitude": feature["longitude"]}
        for feature in districts
    ]
    (DATA / "london-districts.json").write_text(json.dumps(centroids, indent=2) + "\n")
    (DATA / "places.json").write_text(json.dumps(places, indent=2, ensure_ascii=False) + "\n")
