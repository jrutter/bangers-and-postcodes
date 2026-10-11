import httpx
import pytest

from bangers_postcodes.playlist import LoginError, chunked, create_playlist, parse_callback_path, track_uris
from bangers_postcodes.spotify import REDIRECT_URI, SpotifyClient


def test_callback_path_checks_state_and_code():
    assert parse_callback_path("/callback?code=abc&state=ok", "ok") == "abc"
    with pytest.raises(LoginError):
        parse_callback_path("/callback?code=abc&state=nope", "ok")
    with pytest.raises(LoginError):
        parse_callback_path("/other?code=abc&state=ok", "ok")
    with pytest.raises(LoginError):
        parse_callback_path("/callback?error=access_denied&state=ok", "ok")


def test_track_uris_dedupe_artists_and_prefer_higher_popularity():
    artists = [
        {
            "name": "Low",
            "spotify": {
                "id": "a",
                "popularity": 10,
                "followers": 1,
                "representative_track": {"uri": "spotify:track:low"},
            },
        },
        {
            "name": "Alias of high",
            "spotify": {
                "id": "b",
                "popularity": 80,
                "followers": None,
                "representative_track": {"uri": "spotify:track:high"},
            },
        },
        {
            "name": "Same spotify artist",
            "spotify": {
                "id": "b",
                "popularity": 80,
                "representative_track": {"uri": "spotify:track:other"},
            },
        },
        {"name": "No match", "spotify": None},
    ]
    assert track_uris(artists) == ["spotify:track:high", "spotify:track:low"]


def test_chunks_stop_at_100():
    uris = [f"spotify:track:{index}" for index in range(101)]
    batches = chunked(uris, 100)
    assert [len(batch) for batch in batches] == [100, 1]


def test_create_playlist_posts_private_playlist_and_track_batches():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, request.content.decode()))
        if request.url.path == "/v1/me/playlists":
            return httpx.Response(
                201,
                json={"id": "pl1", "name": "Bangers", "external_urls": {"spotify": "https://open.spotify.com/playlist/pl1"}},
            )
        if request.url.path == "/v1/playlists/pl1/tracks":
            return httpx.Response(201, json={"snapshot_id": "snap"})
        raise AssertionError(request.url.path)

    client = SpotifyClient("cid", "secret", redirect_uri=REDIRECT_URI, http=httpx.Client(transport=httpx.MockTransport(handler)))
    artists = [
        {
            "name": f"Artist {index}",
            "spotify": {
                "id": f"id{index}",
                "popularity": index,
                "representative_track": {"uri": f"spotify:track:{index}"},
            },
        }
        for index in range(101)
    ]
    created = create_playlist(client, "user-token", artists, name="SW London", public=False)
    assert created["track_count"] == 101
    assert created["url"] == "https://open.spotify.com/playlist/pl1"
    create_call = calls[0][2]
    assert '"public":false' in create_call or '"public": false' in create_call
    assert calls[0][0] == "POST"
    assert len(calls) == 3
    client.close()
