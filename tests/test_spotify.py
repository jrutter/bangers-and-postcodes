import httpx

from bangers_postcodes.spotify import (
    REDIRECT_URI,
    SpotifyClient,
    choose_artist,
    choose_track,
    match_artist,
    metrics_from_artist,
    names_match,
)


def _client(handler) -> SpotifyClient:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return SpotifyClient("client-id", "client-secret", http=http)


def test_names_ignore_the_and_punctuation():
    assert names_match("The Buggles", "Buggles")
    assert names_match("Jamie T", "jamie t")
    assert not names_match("Four Tet", "Four Tetters")


def test_missing_popularity_and_followers_stay_missing():
    metrics = metrics_from_artist({"id": "abc", "name": "Route 94", "external_urls": {}})
    assert metrics["popularity"] is None
    assert metrics["followers"] is None
    assert metrics["id"] == "abc"


def test_choose_artist_prefers_exact_name_then_popularity():
    chosen = choose_artist(
        [
            {"id": "other", "name": "Four Tetters", "popularity": 99, "followers": {"total": 1}},
            {"id": "low", "name": "Four Tet", "popularity": 10, "followers": {"total": 5}},
            {"id": "high", "name": "The Four Tet", "popularity": 70, "followers": {"total": 50}},
            {"id": "blank", "name": "Four Tet"},
        ],
        "Four Tet",
    )
    assert chosen["id"] == "high"


def test_choose_track_uses_first_when_popularity_is_absent():
    track = choose_track(
        [
            {"id": "first", "name": "First", "uri": "spotify:track:first"},
            {"id": "second", "name": "Second", "uri": "spotify:track:second", "popularity": None},
        ]
    )
    assert track["id"] == "first"
    assert track["popularity"] is None


def test_match_uses_mocked_spotify_and_handles_a_restricted_artist():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "accounts.spotify.com":
            assert "grant_type=client_credentials" in request.content.decode()
            return httpx.Response(200, json={"access_token": "tok"})
        if request.url.path == "/v1/search" and request.url.params.get("type") == "artist":
            return httpx.Response(
                200,
                json={
                    "artists": {
                        "items": [
                            {
                                "id": "route",
                                "name": "Route 94",
                                "external_urls": {"spotify": "https://open.spotify.com/artist/route"},
                            }
                        ]
                    }
                },
            )
        if request.url.path == "/v1/artists/route":
            return httpx.Response(200, json={"id": "route", "name": "Route 94"})
        if request.url.path == "/v1/artists/route/top-tracks":
            return httpx.Response(
                200,
                json={
                    "tracks": [
                        {
                            "id": "track1",
                            "name": "My Love",
                            "uri": "spotify:track:track1",
                            "album": {"name": "My Love"},
                        }
                    ]
                },
            )
        raise AssertionError(request.url)

    matched = match_artist(_client(handler), {"name": "Route 94", "mbid": "mb"})
    spotify = matched["spotify"]
    assert spotify["id"] == "route"
    assert spotify["match"] == "exact"
    assert spotify["popularity"] is None
    assert spotify["followers"] is None
    assert spotify["representative_track"]["uri"] == "spotify:track:track1"


def test_unmatched_artist_is_left_without_a_spotify_profile():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "accounts.spotify.com":
            return httpx.Response(200, json={"access_token": "tok"})
        if request.url.path == "/v1/search":
            return httpx.Response(200, json={"artists": {"items": [{"id": "x", "name": "Someone Else", "popularity": 50}]}})
        raise AssertionError(request.url)

    matched = match_artist(_client(handler), {"name": "Four Tet"})
    assert matched["spotify"] is None


def test_authorize_url_uses_the_registered_redirect_and_playlist_scopes():
    client = SpotifyClient("cid", "secret")
    url = client.authorize_url("state-123")
    assert "client_id=cid" in url
    assert "response_type=code" in url
    assert "redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback" in url
    assert "playlist-modify-private" in url
    assert "playlist-modify-public" in url
    assert "state=state-123" in url
    assert client.redirect_uri == REDIRECT_URI
    client.close()
