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

Gig listings use a separate pair of keys. Both are optional. With neither set, gig sections stay empty and say so. They are not filled with sample shows.

```
SKIDDLE_API_KEY=
TICKETMASTER_API_KEY=
```

- `SKIDDLE_API_KEY` — [Skiddle API key](https://www.skiddle.com/api/join.php). Free for non-commercial use. The [API notes](https://www.skiddle.com/api/) say commercial use needs written approval from dev@skiddle.com. Reference: [Skiddle web API](https://github.com/Skiddle/web-api/blob/master/README.md).
- `TICKETMASTER_API_KEY` — Discovery API consumer key from the [Ticketmaster developer portal](https://developer.ticketmaster.com/). Sign-up steps are on [Getting started](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/). This is the Discovery API (`app.ticketmaster.com`), not the International Discovery API, which is closed to new keys and does not cover Ticketmaster.co.uk.

The app asks Skiddle for live and club events, and Ticketmaster for music events, inside an 8 mile radius of southwest London, then keeps listings whose postcode is one of the covered districts (the catalogue postcodes, plus TW1 and SW12 for the Twickenham and Balham rooms). Responses are cached for about six hours (`cacheLife` revalidate of 21600 seconds) so a page view does not hit the providers again. `npm run build` does not call them: the listings render on request, behind the same suspense boundary as the Spotify lookup.

In the [Spotify developer dashboard](https://developer.spotify.com/dashboard), the app's redirect URIs must include that exact local address **and** the production https URL, for example `https://your-app.vercel.app/api/auth/callback`. Spotify rejects a login whose redirect URI is not on that list. Login asks for `playlist-modify-private`, `playlist-modify-public`, `user-top-read`, and `user-follow-read`. Playlist creation still uses the two playlist scopes. New playlists are private unless you tick public.

The Spotify app is in development mode. Until a quota extension is approved, other people can log in only after they are added under User Management in the dashboard. After this taste change, those users need to log in again so Spotify grants the new scopes. Taste is read on each request and is not written to a database or cache.

Pages:

- `/` lists the southwest London postcodes and areas, with catalogue counts, plus venues and this week's gigs when a listings key is set. Logged-in listeners also get a For you section.
- `/postcode/sw15` and `/area/putney` list local artists, the source of each locality claim, Spotify matches, and stats. Followers and popularity show as n/a when Spotify omits them. They also list local gigs near that postcode, including touring artists, and a playlist of who is billed in the next 7 days. For you ranks that page's artists and upcoming gigs.
- `/map` draws the covered postcode districts and a pin for each venue. A district opens its artist count, local artists, upcoming gigs, and the existing postcode playlist. A venue opens its address, upcoming gigs, and the venue playlist. Logged-in taste highlights matching districts and pins in red.
- `/gigs` is this week, then later shows, across the covered postcodes. `?sort=for-you` reorders by the listener's taste. Logged-out visitors keep date order and see a login prompt.
- `/venues` and `/venue/half-moon` are the curated rooms. A venue page lists upcoming gigs attached to that room and can build a playlist of who's playing there. `/venues?sort=for-you` puts rooms with a matching upcoming bill first.
- `/playlist` is where you log in with Spotify and create the playlist. The same form covers a postcode, this week's gigs, or a venue.

Artist search and track lookup use the client-credentials flow and stay on the server. The client secret is never sent to the browser. Without credentials, the artist lists still render and Spotify fields stay empty.

## Deploy on Vercel

1. Import this repository. The framework preset is Next.js. The build command is `npm run build`.
2. Add environment variables: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REDIRECT_URI`. For gigs, also add `SKIDDLE_API_KEY` and `TICKETMASTER_API_KEY` when you have them. Either gig key can be left unset. For the weekly email, add the newsletter variables in the next section when you are ready. Until then the signup form says it is not switched on.
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
- `lib/gigs/` — gig provider interface, Skiddle, Ticketmaster, and the southwest filter
- `lib/venues.ts` — curated rooms (addresses and postcodes, not gig dates)
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
- For you uses top artists and tracks (about four weeks and about six months) and followed artists. If Spotify withholds genres or related artists, which newer apps often do, ranking falls back to those direct name matches and to artists credited on top tracks. Nothing is ranked for a logged-out visitor.
- Listeners who logged in before `user-top-read` was requested still have a working playlist session. They need to log in again before For you can read their taste.
- The map uses [MapLibre GL](https://maplibre.org/) (BSD-3-Clause) and [OpenFreeMap](https://openfreemap.org/) vector tiles, which need no API key. The tiles are OpenStreetMap data under the [Open Database Licence](https://www.openstreetmap.org/copyright). Postcode district shapes are the Wikipedia KML polygons republished by [uk-postcode-polygons](https://github.com/missinglink/uk-postcode-polygons), © Wikipedia contributors, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Centroids used elsewhere in the app are from postcodes.io under the Open Government Licence. Twickenham (TW1) and Balham (SW12) are drawn because venues sit there; they are not artist-catalogue postcodes, so they have no area playlist.
- Popularity and follower counts depend on what the Spotify app is allowed to see.
- Creating a playlist for all of southwest London matches the whole catalogue on Spotify in that request, so it can take a while.
- Gig dates are only shown when Skiddle or Ticketmaster return them. There is no checked-in sample calendar.
- Pryzm Kingston (154 Clarence Street, KT1 1QP) closed in July 2025. A current Hippodrome music room in Kingston could not be verified, so neither is in the venue list. The Fighting Cocks, Banquet Records, and the other rooms on `/venues` are.
- Songkick's public API is no longer available. Bandsintown's API is aimed at a single artist, or at partners who write to API@bandsintown.com, and it does not search by venue, so it is not wired up. A new provider is a `GigProvider` added to `gigProviders` in `lib/gigs/providers.ts`.
- Ticketmaster Discovery can be thin for UK pub bills. Skiddle is the practical source for those. Club and live event codes are both requested. Theatre listings are left out unless a feed files them as music.
- TW1 (Twickenham) and SW12 (Balham) are outside the artist-catalogue postcodes. They are included so Eel Pie Club, The Exchange, and The Bedford have a page. They show on the borough pages, not on TW9 or SW18.
