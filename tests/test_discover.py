from bangers_postcodes.discover import (
    assemble_artists,
    has_musical_release,
    locality_from_mb,
    search_plan,
)
from bangers_postcodes.stats import build_stats

PUTNEY = "79e9cadb-c71e-40fc-bf78-950ef290517e"
BARNES = "2a16c206-6158-4751-95dc-7a799d250e2c"
KINGSTON_BOROUGH = "5d9d8e13-c62b-4fe8-8f18-7b22346a7ed8"


def _artist(**overrides):
    base = {
        "id": "mbid-1",
        "name": "Example Artist",
        "sort-name": "Example Artist",
        "type": "Person",
        "disambiguation": None,
        "country": "GB",
        "tags": [],
        "life-span": {"begin": "1990", "ended": False},
        "area": {"id": "uk", "name": "United Kingdom"},
        "begin-area": None,
    }
    base.update(overrides)
    return base


def test_search_plan_shares_one_query_for_both_kingstons():
    kingston = [step for step in search_plan() if step["area_name"] == "Kingston upon Thames"]
    assert len(kingston) == 1
    assert "82d06beb-9ddb-4f9b-bc83-95fab1304289" in kingston[0]["mbids"]
    assert KINGSTON_BOROUGH in kingston[0]["mbids"]
    assert 'beginarea:"Kingston upon Thames"' in kingston[0]["query"]


def test_begin_area_mbid_decides_the_place_not_the_name():
    local = _artist(
        name="Four Tet",
        **{"begin-area": {"id": PUTNEY, "name": "Putney"}, "tags": [{"name": "electronic"}]},
    )
    places = locality_from_mb(local)
    assert [place["place_id"] for place in places] == ["putney"]
    assert places[0]["postcodes"] == ["SW15"]
    assert places[0]["claims"][0]["source"] == "musicbrainz"
    assert places[0]["claims"][0]["field"] == "begin-area"

    other_barnes = _artist(**{"begin-area": {"id": "not-london", "name": "Barnes"}})
    assert locality_from_mb(other_barnes) == []


def test_assembly_keeps_musicians_and_drops_writers_without_releases():
    four_tet = _artist(
        id="four-tet",
        name="Four Tet",
        **{"sort-name": "Four Tet", "begin-area": {"id": PUTNEY, "name": "Putney"}, "tags": [{"name": "electronic"}]},
    )
    writer = _artist(
        id="alice",
        name="Alice Meynell",
        **{
            "sort-name": "Meynell, Alice",
            "disambiguation": "writer, editor, critic, suffragist, poet",
            "begin-area": {"id": BARNES, "name": "Barnes"},
        },
    )
    guitarist = _artist(
        id="bryan",
        name="Bryan Daly",
        **{
            "sort-name": "Daly, Bryan",
            "disambiguation": "guitarist",
            "begin-area": {"id": BARNES, "name": "Barnes"},
        },
    )
    band = _artist(
        id="vamp",
        name="Transvision Vamp",
        type="Group",
        **{"sort-name": "Transvision Vamp", "begin-area": {"id": PUTNEY, "name": "Putney"}},
    )
    borough = _artist(
        id="junior",
        name="Junior Giscombe",
        **{
            "sort-name": "Giscombe, Junior",
            "tags": [{"name": "soul"}],
            "begin-area": {"id": KINGSTON_BOROUGH, "name": "Kingston upon Thames"},
        },
    )
    # Kingston borough MBID is Wandsworth? No, KINGSTON_BOROUGH constant.
    # Junior was Wandsworth in real data; this fixture just checks borough routing.
    releases = {"alice": [{"primary-type": "Other", "title": "Interview"}]}

    artists = assemble_artists(
        {artist["id"]: artist for artist in (four_tet, writer, guitarist, band, borough)},
        [],
        lambda mbid: releases.get(mbid, []),
    )
    names = [artist["name"] for artist in artists]
    assert names == ["Bryan Daly", "Four Tet", "Junior Giscombe", "Transvision Vamp"]
    junior = next(artist for artist in artists if artist["name"] == "Junior Giscombe")
    assert junior["locality"][0]["precision"] == "borough"
    assert junior["locality"][0]["postcodes"] == []


def test_wikidata_birthplace_adds_a_claim_and_generic_musicians_without_mbid_are_dropped():
    jamie = _artist(
        id="jamie",
        name="Jamie T",
        **{"sort-name": "Jamie T", "tags": [{"name": "indie"}], "begin-area": {"id": "london", "name": "London"}},
    )
    rows = [
        {
            "qid": "Q123",
            "name": "Jamie T",
            "mbid": "jamie",
            "place_qid": "Q736742",
            "place_label": "Wimbledon",
            "claim": "place of birth",
            "occupations": ["singer-songwriter"],
            "instance_of": ["human"],
        },
        {
            "qid": "Q999",
            "name": "Sophie Kinsella",
            "mbid": None,
            "place_qid": "Q3057456",
            "place_label": "Roehampton",
            "claim": "place of birth",
            "occupations": ["musician", "novelist"],
            "instance_of": ["human"],
        },
        {
            "qid": "Q555",
            "name": "Local Singer",
            "mbid": None,
            "place_qid": "Q3367868",
            "place_label": "Fulham",
            "claim": "place of birth",
            "occupations": ["singer"],
            "instance_of": ["human"],
        },
    ]
    artists = assemble_artists({"jamie": jamie}, rows, lambda mbid: [])
    by_name = {artist["name"]: artist for artist in artists}
    assert "Sophie Kinsella" not in by_name
    assert by_name["Local Singer"]["locality"][0]["postcodes"] == ["SW6"]
    assert by_name["Local Singer"]["mbid"] is None
    jamie_places = by_name["Jamie T"]["locality"]
    assert jamie_places[0]["place_id"] == "wimbledon"
    assert jamie_places[0]["claims"][0]["source"] == "wikidata"
    assert by_name["Jamie T"]["wikidata_qid"] == "Q123"


def test_non_music_comments_do_not_survive_an_audiobook_release():
    author = _artist(
        id="author",
        name="Sophie Kinsella",
        **{
            "sort-name": "Kinsella, Sophie",
            "disambiguation": "author",
            "begin-area": {"id": "not-used", "name": "London"},
        },
    )
    # Locality comes from Wikidata, the way her real record does.
    artists = assemble_artists(
        {"author": author},
        [
            {
                "qid": "Q235014",
                "name": "Sophie Kinsella",
                "mbid": "author",
                "place_qid": "Q3057456",
                "claim": "place of birth",
                "occupations": ["musician", "novelist"],
                "instance_of": ["human"],
            }
        ],
        lambda mbid: [{"primary-type": "Album", "title": "Audiobook"}],
    )
    assert artists == []


def test_qid_labels_and_symbol_names_are_dropped():
    singer = {
        "qid": "Q21166229",
        "name": "Q21166229",
        "mbid": None,
        "place_qid": "Q2465220",
        "claim": "place of birth",
        "occupations": ["pianist"],
        "instance_of": ["human"],
    }
    symbol = _artist(
        id="symbol",
        name="00110100 01010100",
        **{"sort-name": "00110100", "tags": [{"name": "electronic"}], "begin-area": {"id": PUTNEY, "name": "Putney"}},
    )
    artists = assemble_artists({"symbol": symbol}, [singer], lambda mbid: [])
    assert artists == []


def test_release_group_types():
    assert has_musical_release([{"primary-type": "Single"}])
    assert not has_musical_release([{"primary-type": "Other"}])
    assert not has_musical_release([])


def test_borough_artists_do_not_inflate_postcode_counts():
    artist = {
        "name": "Borough Only",
        "type": "Person",
        "locality": [
            {
                "place_id": "wandsworth-borough",
                "place_name": "Wandsworth (borough)",
                "postcodes": [],
                "precision": "borough",
                "claims": [{"source": "musicbrainz", "field": "begin-area"}],
            }
        ],
    }
    precise = {
        "name": "Southfields Band",
        "type": "Group",
        "locality": [
            {
                "place_id": "southfields",
                "place_name": "Southfields",
                "postcodes": ["SW18"],
                "precision": "place",
                "claims": [{"source": "musicbrainz", "field": "begin-area"}],
            }
        ],
    }
    stats = build_stats([artist, precise])
    sw18 = next(row for row in stats["by_postcode"] if row["postcode"] == "SW18")
    assert sw18["artist_count"] == 1
    assert stats["borough_precision_count"] == 1
    assert stats["place_precision_count"] == 1
