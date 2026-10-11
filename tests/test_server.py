from bangers_postcodes.server import load_view, render_page


def test_page_embeds_artists_and_escapes_markup():
    view = {
        "missing": False,
        "has_spotify": False,
        "postcodes": [{"postcode": "SW13", "places": ["Barnes"], "artist_count": 1}],
        "stats": {"artist_count": 1, "place_precision_count": 1, "borough_precision_count": 0},
        "artists": [
            {
                "name": "<img alt=x>",
                "type": "Person",
                "locality": [
                    {
                        "place_id": "barnes",
                        "place_name": "Barnes",
                        "postcodes": ["SW13"],
                        "precision": "place",
                        "claims": [{"source": "musicbrainz", "field": "begin-area", "area_name": "Barnes"}],
                    }
                ],
            }
        ],
    }
    html = render_page(view)
    assert "<img alt=x>" not in html
    assert "\\u003cimg alt=x>" in html
    assert "Bangers" in html
    assert "SW13" in html


def test_missing_file_is_reported(tmp_path):
    view = load_view(str(tmp_path / "missing.json"), str(tmp_path / "also-missing.json"))
    assert view["missing"] is True
    html = render_page(view)
    assert "artists" in html
