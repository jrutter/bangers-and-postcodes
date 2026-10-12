"""Wikidata place-of-birth and location-of-formation lookup."""

from __future__ import annotations

import re

import httpx

from bangers_postcodes.areas import PLACES
from bangers_postcodes.musicbrainz import USER_AGENT

SPARQL_URL = "https://query.wikidata.org/sparql"
MUSICAL_GROUP = "Q215380"
# Occupations that are easy to over-apply on Wikidata. A bare "musician" tag
# is not enough for someone who has no MusicBrainz recording history.
GENERIC_MUSIC_OCCUPATIONS = {"musician"}
SPECIFIC_MUSIC_OCCUPATIONS = {
    "singer",
    "rapper",
    "songwriter",
    "composer",
    "singer-songwriter",
    "disc jockey",
    "dj",
    "guitarist",
    "drummer",
    "bassist",
    "bass guitarist",
    "record producer",
    "music producer",
    "pianist",
    "violinist",
    "saxophonist",
    "conductor",
    "cellist",
    "organist",
    "trumpeter",
    "flautist",
    "keyboardist",
    "vocalist",
    "opera singer",
    "jazz musician",
    "folk singer",
    "blues musician",
    "rock musician",
    "hip hop musician",
    "pop singer",
    "beatmaker",
    "remixer",
}
GROUP_LABELS = {
    "musical group",
    "band",
    "rock group",
    "musical ensemble",
    "girl group",
    "boy band",
}


class WikidataError(RuntimeError):
    pass


def build_query(qids: list[str] | None = None) -> str:
    ids = qids or [place.wikidata_qid for place in PLACES if place.wikidata_qid]
    values = " ".join(f"wd:{qid}" for qid in ids)
    return f"""
SELECT ?item ?itemLabel ?mbid ?place ?placeLabel ?claim ?occLabel ?classLabel ?born ?died ?inception ?dissolved WHERE {{
  VALUES ?place {{ {values} }}
  {{
    ?item wdt:P19 ?place .
    BIND("place of birth" AS ?claim)
  }} UNION {{
    ?item wdt:P740 ?place .
    BIND("location of formation" AS ?claim)
  }}
  {{
    ?item wdt:P31/wdt:P279* wd:{MUSICAL_GROUP} .
  }} UNION {{
    ?item wdt:P106/wdt:P279* wd:Q639669 .
  }} UNION {{
    VALUES ?occFilter {{ wd:Q36834 wd:Q753110 wd:Q130857 wd:Q488205 wd:Q2252262 wd:Q855091 wd:Q183945 }}
    ?item wdt:P106 ?occFilter .
  }}
  OPTIONAL {{ ?item wdt:P434 ?mbid }}
  OPTIONAL {{ ?item wdt:P106 ?occ }}
  OPTIONAL {{ ?item wdt:P31 ?class }}
  OPTIONAL {{ ?item wdt:P569 ?born }}
  OPTIONAL {{ ?item wdt:P570 ?died }}
  OPTIONAL {{ ?item wdt:P571 ?inception }}
  OPTIONAL {{ ?item wdt:P576 ?dissolved }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
""".strip()


def fetch_rows(*, http: httpx.Client | None = None, query: str | None = None) -> list[dict]:
    owns = http is None
    client = http or httpx.Client(
        timeout=90.0,
        headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"},
    )
    try:
        response = client.get(
            SPARQL_URL,
            params={"query": query or build_query()},
        )
        if response.status_code >= 400:
            raise WikidataError(
                f"Wikidata {response.status_code}: {response.text[:400]}"
            )
        payload = response.json()
    except httpx.HTTPError as exc:
        raise WikidataError(f"Wikidata request failed: {exc}") from exc
    finally:
        if owns:
            client.close()
    bindings = (payload.get("results") or {}).get("bindings") or []
    rows = []
    for binding in bindings:
        rows.append(
            {
                "qid": _id(binding.get("item")),
                "name": _value(binding.get("itemLabel")),
                "mbid": _value(binding.get("mbid")) or None,
                "place_qid": _id(binding.get("place")),
                "place_label": _value(binding.get("placeLabel")),
                "claim": _value(binding.get("claim")),
                "occupation": _value(binding.get("occLabel")) or None,
                "instance_of": _value(binding.get("classLabel")) or None,
                "born": _year(_value(binding.get("born"))),
                "died": _year(_value(binding.get("died"))),
                "inception": _year(_value(binding.get("inception"))),
                "dissolved": _year(_value(binding.get("dissolved"))),
            }
        )
    return rows


def group_rows(rows: list[dict]) -> list[dict]:
    """Collapse repeated occupation rows into one record per person and place claim."""
    grouped: dict[tuple, dict] = {}
    for row in rows:
        key = (row.get("qid"), row.get("place_qid"), row.get("claim"), row.get("mbid"))
        current = grouped.get(key)
        if current is None:
            current = {
                "qid": row.get("qid"),
                "name": row.get("name"),
                "mbid": row.get("mbid"),
                "place_qid": row.get("place_qid"),
                "place_label": row.get("place_label"),
                "claim": row.get("claim"),
                "occupations": [],
                "instance_of": [],
                "born": None,
                "died": None,
                "inception": None,
                "dissolved": None,
            }
            grouped[key] = current
        if row.get("occupation") and row["occupation"] not in current["occupations"]:
            current["occupations"].append(row["occupation"])
        if row.get("instance_of") and row["instance_of"] not in current["instance_of"]:
            current["instance_of"].append(row["instance_of"])
        for field in ("born", "died", "inception", "dissolved"):
            year = row.get(field)
            if isinstance(year, int) and current.get(field) is None:
                current[field] = year
    return list(grouped.values())


def has_specific_music_role(record: dict) -> bool:
    if _is_group(record):
        return True
    for occupation in record.get("occupations") or []:
        label = occupation.casefold().strip()
        if label in SPECIFIC_MUSIC_OCCUPATIONS:
            return True
    return False


def _is_group(record: dict) -> bool:
    for label in record.get("instance_of") or []:
        if label.casefold().strip() in GROUP_LABELS:
            return True
    return False


def _year(value: str) -> int | None:
    match = re.search(r"(\d{4})", value or "")
    if not match:
        return None
    year = int(match.group(1))
    if year < 1000 or year > 2100:
        return None
    return year


def _value(node: dict | None) -> str:
    if not node:
        return ""
    return str(node.get("value") or "")


def _id(node: dict | None) -> str:
    value = _value(node)
    if "/entity/" in value:
        return value.rsplit("/", 1)[-1]
    return value
