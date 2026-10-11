import httpx

from bangers_postcodes.musicbrainz import MusicBrainzClient, shard_query


def test_shard_query_keeps_the_original_clause():
    shards = shard_query('beginarea:"Richmond" OR area:"Richmond"', 0)
    assert len(shards) == 3
    assert shards[0] == '(beginarea:"Richmond" OR area:"Richmond") AND (country:GB)'
    assert "NOT country:GB AND NOT country:US" in shards[2]


def test_search_splits_when_the_window_would_pass_500():
    requested = []

    def handler(request: httpx.Request) -> httpx.Response:
        query = request.url.params.get("query") or ""
        offset = int(request.url.params.get("offset") or 0)
        limit = int(request.url.params.get("limit") or 100)
        requested.append((query, offset, limit))
        assert offset + limit <= 500
        if query == "wide":
            return httpx.Response(200, json={"count": 600, "artists": [{"id": "ignored", "name": "Ignored"}]})
        if "country:GB" in query:
            return httpx.Response(
                200,
                json={"count": 1, "artists": [{"id": "gb", "name": "Local"}]},
            )
        return httpx.Response(200, json={"count": 0, "artists": []})

    client = MusicBrainzClient(
        http=httpx.Client(transport=httpx.MockTransport(handler)),
        min_interval=0,
        sleeper=lambda _seconds: None,
    )
    found = client.search_artists("wide")
    assert [artist["id"] for artist in found] == ["gb"]
    assert all(offset + limit <= 500 for _, offset, limit in requested)
    client.close()
