# Bangers & Postcodes

The best new music from your ends. Pick a London postcode and get a Spotify playlist of artists from right round the corner, plus stats on who's local, who's growing, and which part of town is turning out the tunes. Starting in southwest London, from Barnes to Wimbledon.

Spotify does not know where an artist is from. This project decides who counts as local from public data, records the source of each claim, then matches those artists on Spotify.

Places in v1: Barnes (SW13), Putney and Roehampton (SW15), Richmond, Kew (TW9), Ham and Petersham (TW10), Kingston upon Thames and Norbiton (KT1/KT2), Wimbledon (SW19), Mortlake and East Sheen (SW14), Fulham (SW6), Southfields (SW18). Borough-level links for Wandsworth, Kingston upon Thames, and Richmond upon Thames are kept separate, because those areas are wider than one postcode.

## Setup

Python 3.11 or newer.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
```

Put your Spotify app credentials in `.env`. Do not commit that file.

```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
```

The redirect URI has to stay `http://127.0.0.1:8888/callback`. That is the URI registered on the Spotify app. Playlist login listens on that exact address.

## Commands

Discovery only. This queries MusicBrainz and Wikidata and writes the artist list. The copy in `data/artists.json` is a real run of that command.

```bash
bangers discover --output data/artists.json
```

Discovery, Spotify matching, and stats in one go. Uses the client-credentials flow (no browser). Needs `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`. Writes `data/run.json`.

```bash
bangers run --output data/run.json
```

To match the artists already saved in `data/artists.json` without querying MusicBrainz again:

```bash
bangers run --artists data/artists.json --output data/run.json
```

Log in and create a playlist from that file. This opens a browser for the Authorization Code flow, with scopes `playlist-modify-private` and `playlist-modify-public`. The playlist is private unless you pass `--public`.

```bash
bangers playlist --input data/run.json
```

Stats page, from the discovery file or from `data/run.json` if that file exists:

```bash
bangers serve --port 8741
```

Then open http://127.0.0.1:8741

Tests:

```bash
pytest
```

Spotify calls in the tests use mocked HTTP. A live Spotify run needs credentials, which are not stored in this repo.

## How locality is decided

An artist is local when at least one of these is true:

- MusicBrainz **area** or **begin area** is one of the area IDs in `src/bangers_postcodes/areas.py`. The name is not enough. "Richmond", "Barnes", "Kew", and "Wimbledon" all exist outside London, and those other areas are rejected.
- Wikidata **place of birth** (P19) or **location of formation** (P740) is one of the Wikidata items for the same places.

Each artist record stores every claim, including the source, the field, and the area id or Wikidata id. People linked only at borough level are flagged `precision: "borough"` and are not counted inside a single postcode.

Musical artists are MusicBrainz groups, or people with a music tag, a music disambiguation, or an album, single, or EP. Wikidata-only names need a specific role (singer, rapper, composer, and so on). A bare "musician" occupation is ignored, because Wikidata applies it to actors and novelists.

Spotify matching keeps an artist only when the Spotify name matches after case, punctuation, and a leading "The" are ignored. Followers and popularity are copied when the API sends them and left null when it does not. Newer Spotify apps often omit those fields. The representative track is the top track in the GB market, or a track search if top tracks are missing.

## Layout

- `src/bangers_postcodes/areas.py` — postcodes and the MusicBrainz / Wikidata ids behind them
- `src/bangers_postcodes/discover.py` — locality and the musician filter
- `src/bangers_postcodes/spotify.py` — client credentials, matching, top tracks
- `src/bangers_postcodes/playlist.py` — login on port 8888 and playlist creation
- `src/bangers_postcodes/stats.py` — counts per place and postcode, top artists
- `data/artists.json` — committed discovery output

## Limitations

- This is not a census. It only includes artists an editor has linked to these places.
- MusicBrainz has no London area for Kew, Ham, Petersham, East Sheen, Roehampton, or Norbiton. Those places come from Wikidata only.
- The MusicBrainz areas named Wandsworth, Kingston upon Thames (the subdivision), and Richmond upon Thames are boroughs. Artists tagged there might be from Battersea, Surbiton, Twickenham, and so on. They are listed under the borough, not forced into SW18, KT1, or TW9.
- Hammersmith and Fulham as a borough is not treated as Fulham SW6.
- The same person can appear more than once when MusicBrainz has several artist records (Four Tet and Kieran Hebden, for example). Playlist creation keeps one track per Spotify artist. Aliases with no letters in the name are skipped.
- A MusicBrainz comment that calls someone an author, actor, poet, or similar keeps them out, unless that comment also describes them as a musician. Wikidata items with no English name are skipped.
- Spotify has no hometown field, so a match is a name match, not a biography check.
- Popularity and follower counts depend on what the Spotify app is allowed to see.
