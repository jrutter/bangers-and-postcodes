from bangers_postcodes.stats import build_stats


def _artist(name, place_id, place_name, postcodes, precision="place", popularity=None, followers=None, spotify_id=None):
    artist = {
        "name": name,
        "type": "Person",
        "mbid": name.lower().replace(" ", "-"),
        "locality": [
            {
                "place_id": place_id,
                "place_name": place_name,
                "postcodes": postcodes,
                "precision": precision,
                "claims": [{"source": "musicbrainz", "field": "begin-area", "area_name": place_name}],
            }
        ],
    }
    if spotify_id:
        artist["spotify"] = {
            "id": spotify_id,
            "popularity": popularity,
            "followers": followers,
            "representative_track": {"name": f"{name} song", "uri": f"spotify:track:{spotify_id}"},
        }
    return artist


def test_top_artists_rank_known_popularity_ahead_of_missing_fields():
    artists = [
        _artist("Quiet Local", "barnes", "Barnes", ["SW13"], popularity=None, followers=None, spotify_id="q"),
        _artist("Big Local", "putney", "Putney", ["SW15"], popularity=70, followers=1000, spotify_id="b"),
        _artist("Mid Local", "fulham", "Fulham", ["SW6"], popularity=40, followers=None, spotify_id="m"),
        _artist("Unmatched", "mortlake", "Mortlake", ["SW14"]),
    ]
    stats = build_stats(artists)
    assert [row["name"] for row in stats["top_artists"][:3]] == ["Big Local", "Mid Local", "Quiet Local"]
    assert stats["top_artists"][0]["popularity"] == 70
    assert stats["top_artists"][2]["popularity"] is None
    assert stats["spotify_matched"] == 3
    assert stats["spotify_unmatched"] == 1
    assert stats["spotify_with_popularity"] == 2
    assert stats["spotify_with_followers"] == 1
    barnes = next(row for row in stats["by_place"] if row["place_id"] == "barnes")
    assert barnes["artist_count"] == 1
    sw13 = next(row for row in stats["by_postcode"] if row["postcode"] == "SW13")
    assert sw13["artist_count"] == 1
