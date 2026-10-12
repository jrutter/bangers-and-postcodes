from bangers_postcodes.venues_build import build_venue_document, parse_skiddle_venues

SQUARE = {
    "type": "Polygon",
    "coordinates": [[[-0.23, 51.46], [-0.21, 51.46], [-0.21, 51.48], [-0.23, 51.48], [-0.23, 51.46]]],
}
OUTSIDE = {
    "type": "Polygon",
    "coordinates": [[[0.1, 51.5], [0.2, 51.5], [0.2, 51.6], [0.1, 51.6], [0.1, 51.5]]],
}


def _gla(name, lat, lon, source="gla-music", address="93 Lower Richmond Road, London SW15 1EU", borough="Wandsworth"):
    return {
        "name": name,
        "address": address,
        "postcode": "SW15 1EU" if "SW15" in address else None,
        "latitude": lat,
        "longitude": lon,
        "borough": borough,
        "website": None,
        "capacity": None,
        "osm_amenity": None,
        "sources": [source],
        "aliases": [],
        "skiddle_id": None,
    }


def test_merge_keeps_the_curated_putney_room_and_drops_pryzm():
    document = build_venue_document(
        gla_rows=[
            _gla("Half Moon Putney", 51.4673, -0.2201, "gla-music"),
            _gla("Half Moon Putney", 51.4674, -0.2202, "gla-grassroots"),
            _gla(
                "Pryzm Kingston",
                51.4115,
                -0.2999,
                address="154 Clarence Street, Kingston upon Thames KT1 1QP",
                borough="Kingston upon Thames",
            ),
        ],
        osm_elements=[
            {
                "type": "node",
                "lat": 51.47,
                "lon": -0.22,
                "tags": {"name": "Night People", "amenity": "nightclub", "capacity": "400"},
            },
            {
                "type": "node",
                "lat": 0.0,
                "lon": 0.0,
                "tags": {"name": "Outside Town", "amenity": "nightclub"},
            },
        ],
        skiddle_rows=[],
        districts=[{"id": "SW15", "geometry": SQUARE}],
        boroughs=[{"name": "Wandsworth", "geometry": SQUARE}, {"name": "Somewhere", "geometry": OUTSIDE}],
        places=[{"id": "putney", "precision": "place", "postcodes": ["SW15"]}],
        skiddle_included=False,
    )
    by_id = {venue["id"]: venue for venue in document["venues"]}
    half = by_id["half-moon"]
    assert half["curated"] is True
    assert half["postcode"] == "SW15 1EU"
    assert half["type"] == "pub"
    assert half["grassroots"] is True
    assert "gla-music" in half["sources"]
    assert "gla-grassroots" in half["sources"]
    assert "curated" in half["sources"]
    assert "putney" in half["areaIds"]
    assert all("pryzm" not in venue["name"].casefold() for venue in document["venues"])
    night = next(venue for venue in document["venues"] if venue["name"] == "Night People")
    assert night["type"] == "club"
    assert night["capacity"] == 400
    assert night["borough"] == "Wandsworth"
    assert night["postcodeDistrict"] == "SW15"
    assert all(venue["name"] != "Outside Town" for venue in document["venues"])
    assert document["skiddle_included"] is False


def test_skiddle_parser_rejects_an_error_and_reads_a_venue():
    try:
        parse_skiddle_venues({"error": 1, "errormessage": "no key", "results": []})
    except RuntimeError as exc:
        assert "no key" in str(exc)
    else:
        raise AssertionError("expected an error")
    rows = parse_skiddle_venues(
        {
            "error": 0,
            "results": [
                {
                    "id": 42,
                    "name": "The Lexington",
                    "address": "96-98 Pentonville Road",
                    "town": "London",
                    "postcode": "N1 9JB",
                    "latitude": 51.531,
                    "longitude": -0.111,
                    "type": "L",
                    "website": "http://thelexington.co.uk/",
                    "capacity": "200",
                }
            ],
        }
    )
    assert rows[0]["sources"] == ["skiddle"]
    assert rows[0]["website"] == "https://thelexington.co.uk/"
    assert rows[0]["postcode"] == "N1 9JB"
    assert rows[0]["capacity"] == 200
    assert rows[0]["osm_amenity"] == "music_venue"
