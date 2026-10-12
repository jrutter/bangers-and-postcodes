# Bangers & Postcodes

The best music from London's postcodes, old and new. Pick a region, then a district, and get a Spotify playlist of artists from that part of town, plus the venues and how to get there. Coverage is Greater London: the inner postcodes and the outer districts that fall inside a London borough, across all 32 boroughs and the City of London. The audience is visitors as well as locals.

Spotify does not know where an artist is from. A Python script decides who counts as local from MusicBrainz and Wikidata, records the source of each claim and the years the artist was active, and writes `data/artists.json`. The Next.js app reads that file. It matches a page of artists on Spotify from the server, and a logged-in listener can save a playlist to their account.

Neighbourhoods come from Wikidata items that have a MusicBrainz area id inside a London borough. The hand-checked southwest places (Barnes, Putney, Richmond, Kew, and the rest) keep their ids and postcodes. Borough-level links, including the City of London, have no postcode of their own, because those areas are wider than one district.

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

Gig listings use a separate pair of keys. Both are optional. With neither set, gig sections stay empty and say so. They are not filled with sample shows.

```
SKIDDLE_API_KEY=
TICKETMASTER_API_KEY=
```

- `SKIDDLE_API_KEY` — [Skiddle API key](https://www.skiddle.com/api/join.php). Free for non-commercial use. The [API notes](https://www.skiddle.com/api/) say commercial use needs written approval from dev@skiddle.com. Reference: [Skiddle web API](https://github.com/Skiddle/web-api/blob/master/README.md).
- `TICKETMASTER_API_KEY` — Discovery API consumer key from the [Ticketmaster developer portal](https://developer.ticketmaster.com/). Sign-up steps are on [Getting started](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/). This is the Discovery API (`app.ticketmaster.com`), not the International Discovery API, which is closed to new keys and does not cover Ticketmaster.co.uk.

Product analytics uses [PostHog](https://posthog.com/docs/libraries/next-js). Copy the two `NEXT_PUBLIC_POSTHOG_*` values from `.env.example` into `.env.local` and into the Vercel project. Leave `NEXT_PUBLIC_POSTHOG_KEY` blank and the app does not load analytics. The browser sends events to `/ingest` on this site, which Next.js rewrites to PostHog, so the host value stays `https://us.i.posthog.com`. Events include `app: bangers-and-postcodes` because the PostHog project is shared. PostHog does not load, and session replay stays off, until the visitor accepts the banner. Do Not Track is treated as a rejection. Logged-in listeners are identified by a hash of their Spotify user id. Emails, Spotify tokens, and playlist names are not sent.

The app asks Skiddle for live and club events, and Ticketmaster for music events, inside an 8 mile radius of southwest London, then keeps listings whose postcode is one of the covered districts (the catalogue postcodes, plus TW1 and SW12 for the Twickenham and Balham rooms). Responses are cached for about six hours (`cacheLife` revalidate of 21600 seconds) so a page view does not hit the providers again. `npm run build` does not call them: the listings render on request, behind the same suspense boundary as the Spotify lookup.

In the [Spotify developer dashboard](https://developer.spotify.com/dashboard), the app's redirect URIs must include that exact local address **and** the production https URL, for example `https://your-app.vercel.app/api/auth/callback`. Spotify rejects a login whose redirect URI is not on that list. Login asks for `playlist-modify-private`, `playlist-modify-public`, `user-top-read`, and `user-follow-read`. Playlist creation still uses the two playlist scopes. New playlists are private unless you tick public.

The Spotify app is in development mode. Until a quota extension is approved, other people can log in only after they are added under User Management in the dashboard. After this taste change, those users need to log in again so Spotify grants the new scopes. Taste is read on each request and is not written to a database or cache.

Pages:

- `/` leads with a region picker and the London map. Inner regions are the compass postcodes (EC and WC together as Central). Outer regions group EN, HA, UB, TW, KT, CR, SM, BR, DA, IG, and RM by direction. Logged-in listeners also get a For you section, a short list of their English favourites, and this week's gigs when a listings key is set.
- `/favourites` is Your English favourites. For a logged-in listener it keeps Spotify top artists (about 4 weeks, 6 months, and several years, 50 each) and up to 100 followed artists when Wikidata or MusicBrainz places them in England. Country code GB is not enough. Each row shows the picture, the town, why they are on the list, the origin source, an Open in Spotify link, and a link to a postcode or area when that place is already in this catalogue. Origin unknown and artists not checked yet stay collapsed. A visit spends about 12 seconds on MusicBrainz, then asks for a refresh to continue. Lookups are cached. The playlist form's "Your English favourites" option builds one track per artist, up to 50, through the usual Spotify playlist flow.
- `/region/southwest` is the middle level: a visitor intro, what the postcode areas are known for, how to get there, the map zoomed to that region, its districts, a mix of older and current artists, venues, this week's gigs when the southwest search reaches them, and a region playlist.
- `/postcode/sw15` and `/area/putney` are the district and neighbourhood pages: artists, the source of each locality claim, venues, and the years they were active. An era filter (a decade, before the 1950s, or active now) applies to the list and to the playlist. Long lists are paged. Spotify matches and stats load for the visible page, and are cached. Followers and popularity show as n/a when Spotify omits them. The page also lists local gigs near that postcode, including touring artists, and a playlist of who is billed in the next 7 days. For you ranks that page's artists and upcoming gigs.
- `/map` draws every Greater London postcode district and a pin for every music venue. Pins cluster until you zoom in. The first tap on a district zooms to its region; the next tap opens artists, venues, and the playlist. A venue pin opens its address, upcoming gigs, and the venue playlist. Logged-in taste highlights matching districts and pins.
- `/gigs` is this week, then later shows, across the southwest search. `?sort=for-you` reorders by the listener's taste. Logged-out visitors keep date order and see a login prompt.
- `/venues` and `/venue/half-moon` list music venues across Greater London, grouped by borough and postcode, with search, area, and type filters. A region id works as the area filter. A venue page lists upcoming gigs the southwest feed attaches to that room, and can build a playlist of who's playing there. `/venues?sort=for-you` puts rooms with a matching upcoming bill first. The hand-checked southwest rooms keep their pages. Gig search itself stays an 8 mile radius of southwest London, so a room in the east often has an empty bill until a listing is filed against it.
- `/playlist` is where you log in with Spotify and create the playlist. The same form covers a region, a postcode, this week's gigs, a venue, or your English favourites. The weekly email lists every district, grouped by region.

Artist search and track lookup use the client-credentials flow and stay on the server. The client secret is never sent to the browser. Without credentials, the artist lists still render and Spotify fields stay empty.

## Deploy on Vercel

1. Import this repository. The framework preset is Next.js. The build command is `npm run build`.
2. Add environment variables: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REDIRECT_URI`. For gigs, also add `SKIDDLE_API_KEY` and `TICKETMASTER_API_KEY` when you have them. Either gig key can be left unset. For analytics, add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` from `.env.example`. Both are public. Redeploy after saving them, because Next.js inlines `NEXT_PUBLIC_` values at build time. For the weekly email, add the newsletter variables in the next section when you are ready. Until then the signup form says it is not switched on.
3. Set `SPOTIFY_REDIRECT_URI` to `https://<your-domain>/api/auth/callback`.
4. Add that https URI, and `http://127.0.0.1:3000/api/auth/callback`, in the Spotify dashboard.
5. Redeploy after the variables are saved. `npm run build` does not call Spotify or send email.

## Weekly email

The Thursday email is opt-in. A visitor picks one or more postcode districts (the area or postcode page starts with that district ticked), enters an email, and ticks consent. Spotify login is optional and is not stored. We store the email, the districts, and the times they consent, confirm, and unsubscribe, plus a hashed one-time confirm token and a send ledger so a week is not mailed twice. Preference and unsubscribe links are signed and are not stored.

Nothing weekly goes out until they open the confirmation email. Each Thursday email has a plain-text part, a List-Unsubscribe header, and a one-click unsubscribe link. If a district has no gigs in the next 7 days, that district is left out. If none of their districts have a gig, that subscriber is skipped for the week.

Local development and tests never call Resend. With the database and token secret set, a local signup shows the confirm link on the page instead of sending it. `NEWSLETTER_ALLOW_SEND=1` is an explicit override and should stay unset.

Services to provision:

1. [Neon Postgres on the Vercel Marketplace](https://vercel.com/marketplace/neon). Installing it sets `POSTGRES_URL`. `DATABASE_URL` is accepted as a fallback.
2. [Resend](https://resend.com/signup). Create an API key at [API keys](https://resend.com/api-keys). The [onboarding sender](https://resend.com/docs/send-with-nodejs) (`onboarding@resend.dev`) only delivers to the Resend account address, so a real list needs a verified domain.

Environment variables in the Vercel project:

| Name | Purpose |
| --- | --- |
| `POSTGRES_URL` | Neon connection string from the marketplace integration |
| `RESEND_API_KEY` | Resend API key |
| `NEWSLETTER_FROM` | Verified from address, for example `Bangers & Postcodes <news@updates.example.com>` |
| `NEWSLETTER_TOKEN_SECRET` | Long random string. Signs preference and unsubscribe links |
| `CRON_SECRET` | Vercel sends `Authorization: Bearer <CRON_SECRET>` to the cron route |
| `NEWSLETTER_PREVIEW_SECRET` | Unlocks `/newsletter/preview` |
| `SITE_URL` | `https://bangers-and-postcodes.vercel.app`, or a custom domain later. Used for links inside emails |
| `NEWSLETTER_BATCH_SIZE` | Optional. Default 50. Resend's batch cap is 100 |
| `NEWSLETTER_BATCH_DELAY_MS` | Optional. Default 600, so batches stay under a small account's rate limit |

Sending domain DNS. Add a subdomain such as `updates.example.com` in the [Resend domains dashboard](https://resend.com/domains/add) and copy the records Resend shows. Do not invent the DKIM value. As of October 2026, newer domains may show two CNAMEs; older ones show SPF as an MX plus a TXT, and DKIM as a TXT:

- SPF MX on the return-path host (default `send`): priority 10, value similar to `feedback-smtp.<region>.amazonses.com` (the region is the one Resend picked: `us-east-1`, `eu-west-1`, `ap-northeast-1`, or `sa-east-1`).
- SPF TXT on that same host: `v=spf1 include:amazonses.com ~all`.
- DKIM TXT at `resend._domainkey`: the exact `p=` value from the dashboard.
- Optional DMARC TXT at `_dmarc`: `v=DMARC1; p=none`.

If the DNS host appends your domain onto the MX or CNAME target, add a trailing dot so the name stays absolute. Leave Cloudflare proxying off for these records. Verification is usually within 15 minutes and can take up to 72 hours. Then set `NEWSLETTER_FROM` to an address on that domain.

The cron is `0 8 * * 4` in `vercel.json`: 08:00 UTC on Thursday, which is 08:00 in winter and 09:00 during British Summer Time. The handler only sends between 07:00 and 10:59 UK time unless you call it with `force=1`. A second run in the same ISO week does not send again. A failed batch is marked failed and can be retried; the Resend call uses an idempotency key for that batch.

Preview the rendered email (this does not send):

1. Set `NEWSLETTER_PREVIEW_SECRET`.
2. Open `/newsletter/preview`, enter the secret, and pick a district. `?area=SW15` selects one. The page says whether that issue would actually be sent.
3. Or, from a shell: `curl -H "Authorization: Bearer $NEWSLETTER_PREVIEW_SECRET" "https://bangers-and-postcodes.vercel.app/newsletter/preview?area=SW15"`.

Dry run the cron (reads subscribers, sends nothing):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://bangers-and-postcodes.vercel.app/api/cron/newsletter?dry=1"
```

`sent` in a dry run is the number of emails that would go out. A real Thursday run is the same URL without `dry=1`. Add `&force=1` only when you mean to send outside Thursday morning.

## Discovery script

Python 3.11 or newer. This is only needed to refresh the artist list. The committed `data/artists.json` is a real run.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
bangers places
bangers venues
bangers discover --output data/artists.json
```

`bangers places` rebuilds `data/places.json`, `data/london-districts.json`, and `data/postcode-districts.json`. `bangers venues` rebuilds `data/venues.json`. MusicBrainz is limited to one request a second. Responses are cached under `data/.mb-cache/`, which is gitignored. `bangers discover` searches each MusicBrainz area name, keeps a hit only when the area id is in the gazetteer, merges Wikidata place-of-birth and location-of-formation claims, and dedupes the same artist when two records share a Wikidata id or the same name, type, and place.

## Tests

```bash
npm test
npm run build
pytest
```

Spotify tests mock `fetch`. They do not use live credentials. Pytest covers MusicBrainz and Wikidata discovery with mocked HTTP.

## How locality is decided

An artist is local when at least one of these is true:

- MusicBrainz **area** or **begin area** is one of the area IDs in `data/places.json` (the curated southwest places in `src/bangers_postcodes/areas.py` are the fallback). The name is not enough. "Richmond", "Barnes", "Kew", and "Wimbledon" all exist outside London, and those other areas are rejected.
- Wikidata **place of birth** (P19) or **location of formation** (P740) is one of the Wikidata items for the same places.

Each artist record stores every claim, including the source, the field, and the area id or Wikidata id. People linked only at borough level are flagged `precision: "borough"` and are not counted inside a single postcode.

Musical artists are MusicBrainz groups, or people with a music tag, a music disambiguation, or an album, single, or EP. Wikidata-only names need a specific role (singer, rapper, composer, and so on). A bare "musician" occupation is ignored, because Wikidata applies it to actors and novelists.

Spotify matching keeps an artist only when the Spotify name matches after case, punctuation, and a leading "The" are ignored. Followers and popularity are copied when the API sends them and left null when it does not. Newer Spotify apps often omit those fields. The representative track is the top track in the GB market, or a track search if top tracks are missing.

## Layout

- `app/` — Next.js App Router pages and Spotify login routes
- `lib/` — catalogue, matching, stats, and playlist rules
- `lib/gigs/` — gig provider interface, Skiddle, Ticketmaster, and the southwest filter
- `lib/venues.ts` — London music venues. `bangers venues` rebuilds `data/venues.json` from the GLA Cultural Infrastructure Map (Open Government Licence) and OpenStreetMap (ODbL). Skiddle venues are included when `SKIDDLE_API_KEY` is set.
- `lib/era.ts` — decade filter, paging, and the playlist sample cap
- `data/artists.json` — committed discovery output
- `data/places.json` — London neighbourhoods and boroughs
- `data/postcode-districts.json` — district polygons drawn on the map
- `src/bangers_postcodes/` — MusicBrainz and Wikidata discovery, plus the London gazetteer build

## Limitations

- This is not a census. It only includes artists an editor has linked to these places.
- MusicBrainz has no London area for Kew, Ham, Petersham, East Sheen, Roehampton, or Norbiton. Those places come from Wikidata only.
- The MusicBrainz areas named Wandsworth, Kingston upon Thames (the subdivision), and Richmond upon Thames are boroughs. Artists tagged there might be from Battersea, Surbiton, Twickenham, and so on. They are listed under the borough, not forced into SW18, KT1, or TW9.
- Hammersmith and Fulham as a borough is not treated as Fulham SW6.
- The same person can appear more than once when MusicBrainz has several artist records under different names (Four Tet and Kieran Hebden, for example). Records that share a Wikidata id, or the same name and type in the same place, are merged. When they share a Wikidata id, the kept name is the Wikidata label, then the record with the music tags, so an imprint-style alias such as "4T Recordings" does not replace Four Tet. Playlist creation keeps one track per Spotify artist. Aliases with no letters in the name are skipped.
- A MusicBrainz comment that calls someone an author, actor, poet, or similar keeps them out, unless that comment also describes them as a musician. Wikidata items with no English name are skipped.
- Spotify has no hometown field, so a match is a name match, not a biography check.
- For you uses top artists and tracks (about four weeks and about six months) and followed artists. If Spotify withholds genres or related artists, which newer apps often do, ranking falls back to those direct name matches and to artists credited on top tracks. Nothing is ranked for a logged-out visitor.
- Listeners who logged in before `user-top-read` was requested still have a working playlist session. They need to log in again before For you can read their taste.
- The map uses [MapLibre GL](https://maplibre.org/) (BSD-3-Clause) and [OpenFreeMap](https://openfreemap.org/) vector tiles, which need no API key. The tiles are OpenStreetMap data under the [Open Database Licence](https://www.openstreetmap.org/copyright). Postcode district shapes are the Wikipedia KML polygons republished by [uk-postcode-polygons](https://github.com/missinglink/uk-postcode-polygons), © Wikipedia contributors, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). A district is drawn when the centre of its outer ring sits inside a London borough, or at least 55% of a sample of its vertices do. That check uses ONS generalised local-authority boundaries (Open Government Licence) and the boundary file is not shipped. No WD district meets that test, so WD is absent. Centroids for the original southwest set and for venue fallbacks come from postcodes.io under the Open Government Licence.
- An artist matches a decade when their recorded span overlaps it. An open end runs through the current year, so a band that started in 1968 and has not ended appears in every decade since, and in Active now. Active now needs dates, and it excludes anyone whose span ended before this year. Unknown dates are not Active now.
- Area playlists sample at most 60 catalogue artists, spread across start decades, then keep the top 50 tracks. Spotify matches for a page are cached for about a week.
- Popularity and follower counts depend on what the Spotify app is allowed to see.
- A playlist for all of London still only matches that sample, not every artist in the catalogue.
- Gig search stays an 8 mile radius of the original southwest catalogue. Venue pages outside that radius still exist; their gig list fills when a listing matches the room. The ten hand-checked southwest rooms keep their ids. Pryzm Kingston (154 Clarence Street, KT1 1QP) closed in July 2025 and is left out of the venue file. Gig dates are only shown when Skiddle or Ticketmaster return them. There is no checked-in sample calendar.
- Venue rows come from the GLA Cultural Infrastructure Map 2024 music, grassroots, and nightclub files (Open Government Licence) and from OpenStreetMap (ODbL). The 2026 Cultural Infrastructure workbook is studios and production space, so it is not a performance-venue source. Skiddle's venue endpoint is called only when `SKIDDLE_API_KEY` is set. Capacity is rarely published. A point that falls just outside a simplified borough outline is assigned to the nearest district within 0.8 miles. Outer boroughs are sparse because the GLA music audit does not list a room in every borough; OpenStreetMap fills the gaps it has tagged.
- Pryzm Kingston (154 Clarence Street, KT1 1QP) closed in July 2025. A current Hippodrome music room in Kingston could not be verified, so neither is in the venue list. The Fighting Cocks, Banquet Records, and the other rooms on `/venues` are.
- Songkick's public API is no longer available. Bandsintown's API is aimed at a single artist, or at partners who write to API@bandsintown.com, and it does not search by venue, so it is not wired up. A new provider is a `GigProvider` added to `gigProviders` in `lib/gigs/providers.ts`.
- Ticketmaster Discovery can be thin for UK pub bills. Skiddle is the practical source for those. Club and live event codes are both requested. Theatre listings are left out unless a feed files them as music.
- TW1 (Twickenham) and SW12 (Balham) are on the map with the other Greater London districts. The southwest venue pages for Eel Pie Club, The Exchange, and The Bedford still use them.
