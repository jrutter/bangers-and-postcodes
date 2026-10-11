from bangers_postcodes.areas import PLACES, places_by_mbid, postcodes


def test_place_ids_and_mbids_are_unique():
    assert len({place.id for place in PLACES}) == len(PLACES)
    mbids = [place.musicbrainz_area_mbid for place in PLACES if place.musicbrainz_area_mbid]
    assert len(mbids) == len(set(mbids))


def test_postcodes_cover_the_brief():
    assert postcodes() == ["SW13", "SW15", "TW9", "TW10", "KT1", "KT2", "SW19", "SW14", "SW6", "SW18"]


def test_ambiguous_names_stay_on_the_london_area():
    by_mbid = places_by_mbid()
    assert by_mbid["2a16c206-6158-4751-95dc-7a799d250e2c"].id == "barnes"
    assert by_mbid["2df2bbc1-e61f-44aa-bbd7-25c57729fe98"].id == "richmond"
    assert by_mbid["36eeafda-c557-483e-a7fd-7842c9a892e3"].id == "wimbledon"
    assert by_mbid["82d06beb-9ddb-4f9b-bc83-95fab1304289"].id == "kingston"
    assert by_mbid["5d9d8e13-c62b-4fe8-8f18-7b22346a7ed8"].id == "kingston-borough"


def test_boroughs_are_not_given_a_single_postcode():
    boroughs = [place for place in PLACES if place.precision == "borough"]
    assert boroughs
    assert all(place.postcodes == () for place in boroughs)
