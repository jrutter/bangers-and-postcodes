# Bangers & Postcodes

The best new music from your ends. Pick a London postcode and get a Spotify playlist of artists from right round the corner, plus stats on who's local, who's growing, and which part of town is turning out the tunes. Starting in southwest London, from Barnes to Wimbledon.

Spotify does not know where an artist is from. A Python script decides who counts as local from MusicBrainz and Wikidata, records the source of each claim, and writes `data/artists.json`. The Next.js app reads that file. It matches artists on Spotify from the server, and a logged-in listener can save a playlist to their account.

Places in v1: Barnes (SW13), Putney and Roehampton (SW15), Richmond, Kew (TW9), Ham and Petersham (TW10), Kingston upon Thames and Norbiton (KT1/KT2), Wimbledon (SW19), Mortlake and East Sheen (SW14), Fulham (SW6), Southfields (SW18). Borough-level links for Wandsworth, Kingston upon Thames, and Richmond upon Thames are kept separate, because those areas are wider than one postcode.

## Web app

Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. The dev server uses port 3000 so the default redirect URI matches.

```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback
```

`SPOTIFY_REDIRECT_URI` is optional locally. If it is unset, the app uses `http://127.0.0.1:3000/api/auth/callback`.

In the [Spotify developer dashboard](https://developer.spotify.com/dashboard), the app's redirect URIs must include that exact local address **and** the production https URL, for example `https://your-app.vercel.app/api/auth/callback`. Spotify rejects a login whose redirect URI is not on that list. Playlist login asks for `playlist-modify-private` and `playlist-modify-public`. New playlists are private unless you tick public.

Pages:

- `/` lists the southwest London postcodes and areas, with catalogue counts.
- `/postcode/sw15` and `/area/putney` list local artists, the source of each locality claim, Spotify matches, and stats. Followers and popularity show as n/a when Spotify omits them.
- `/playlist` is where you log in with Spotify and create the playlist.

Artist search and track lookup use the client-credentials flow and stay on the server. The client secret is never sent to the browser. Without credentials, the artist lists still render and Spotify fields stay empty.

## Deploy on Vercel

1. Import this repository. The framework preset is Next.js. The build command is `npm run build`.
2. Add environment variables: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REDIRECT_URI`.
3. Set `SPOTIFY_REDIRECT_URI` to `https://<your-domain>/api/auth/callback`.
4. Add that https URI, and `http://127.0.0.1:3000/api/auth/callback`, in the Spotify dashboard.
5. Redeploy after the variables are saved. `npm run build` does not call Spotify.

## Discovery script

Python 3.11 or newer. This is only needed to refresh the artist list. The committed `data/artists.json` is a real run.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
bangers discover --output data/artists.json
```

## Tests

```bash
npm test
npm run build
pytest
```

Spotify tests mock `fetch`. They do not use live credentials. Pytest covers MusicBrainz and Wikidata discovery with mocked HTTP.

## How locality is decided

An artist is local when at least one of these is true:

- MusicBrainz **area** or **begin area** is one of the area IDs in `src/bangers_postcodes/areas.py`. The name is not enough. "Richmond", "Barnes", "Kew", and "Wimbledon" all exist outside London, and those other areas are rejected.
- Wikidata **place of birth** (P19) or **location of formation** (P740) is one of the Wikidata items for the same places.

Each artist record stores every claim, including the source, the field, and the area id or Wikidata id. People linked only at borough level are flagged `precision: "borough"` and are not counted inside a single postcode.

Musical artists are MusicBrainz groups, or people with a music tag, a music disambiguation, or an album, single, or EP. Wikidata-only names need a specific role (singer, rapper, composer, and so on). A bare "musician" occupation is ignored, because Wikidata applies it to actors and novelists.

Spotify matching keeps an artist only when the Spotify name matches after case, punctuation, and a leading "The" are ignored. Followers and popularity are copied when the API sends them and left null when it does not. Newer Spotify apps often omit those fields. The representative track is the top track in the GB market, or a track search if top tracks are missing.

## Layout

- `app/` — Next.js App Router pages and Spotify login routes
- `lib/` — catalogue, matching, stats, and playlist rules
- `data/artists.json` — committed discovery output
- `src/bangers_postcodes/` — MusicBrainz and Wikidata discovery

## Limitations

- This is not a census. It only includes artists an editor has linked to these places.
- MusicBrainz has no London area for Kew, Ham, Petersham, East Sheen, Roehampton, or Norbiton. Those places come from Wikidata only.
- The MusicBrainz areas named Wandsworth, Kingston upon Thames (the subdivision), and Richmond upon Thames are boroughs. Artists tagged there might be from Battersea, Surbiton, Twickenham, and so on. They are listed under the borough, not forced into SW18, KT1, or TW9.
- Hammersmith and Fulham as a borough is not treated as Fulham SW6.
- The same person can appear more than once when MusicBrainz has several artist records (Four Tet and Kieran Hebden, for example). Playlist creation keeps one track per Spotify artist. Aliases with no letters in the name are skipped.
- A MusicBrainz comment that calls someone an author, actor, poet, or similar keeps them out, unless that comment also describes them as a musician. Wikidata items with no English name are skipped.
- Spotify has no hometown field, so a match is a name match, not a biography check.
- Popularity and follower counts depend on what the Spotify app is allowed to see.
- Creating a playlist for all of southwest London matches the whole catalogue on Spotify in that request, so it can take a while.
