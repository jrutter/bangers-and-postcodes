"""A small local page for browsing artists by postcode."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from bangers_postcodes.stats import build_stats

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bangers &amp; Postcodes</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,680&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --paper: #f4efe4;
      --ink: #1c1915;
      --muted: #5e564c;
      --line: #e2d8c8;
      --card: #fffaf3;
      --green: #0e5c49;
      --green-soft: #e5f2ec;
      --stamp: #c5362b;
      --shadow: 0 16px 40px rgba(48, 32, 12, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(1200px 500px at 90% -10%, #f7d7b0 0%, transparent 55%),
        var(--paper);
      font-family: Outfit, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    header, main { width: min(1080px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 36px 0 8px; }
    .kicker {
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-size: 12px;
      color: var(--stamp);
      font-weight: 600;
      margin: 0 0 8px;
    }
    h1 {
      font-family: Fraunces, Georgia, serif;
      font-size: clamp(40px, 7vw, 72px);
      line-height: 0.92;
      font-weight: 680;
      margin: 0;
      letter-spacing: -0.03em;
    }
    .tagline { max-width: 46rem; font-size: 18px; color: var(--muted); margin: 14px 0 0; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin: 28px 0 8px;
    }
    .stat {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px 16px;
      box-shadow: var(--shadow);
    }
    .stat b {
      display: block;
      font-family: Fraunces, Georgia, serif;
      font-size: 32px;
      line-height: 1;
    }
    .stat span { color: var(--muted); font-size: 13px; }
    .rail { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0; }
    button.postcode, button.texty {
      border: 1px solid var(--line);
      background: transparent;
      color: var(--ink);
      border-radius: 999px;
      padding: 8px 12px;
      font: 600 14px/1 Outfit, sans-serif;
      cursor: pointer;
    }
    button.postcode small { display: block; font-weight: 500; color: var(--muted); font-size: 11px; margin-top: 3px; }
    button.postcode { text-align: left; border-radius: 14px; padding: 8px 12px 7px; }
    button.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
    button.active small { color: #d9d0c3; }
    .layout { display: grid; grid-template-columns: 220px 1fr; gap: 22px; padding-bottom: 64px; }
    aside h2, .results h2 {
      font-family: Fraunces, Georgia, serif;
      font-size: 28px;
      margin: 0 0 6px;
    }
    .note { color: var(--muted); font-size: 14px; margin: 0 0 14px; }
    .search {
      width: 100%;
      border: 1px solid var(--line);
      background: var(--card);
      border-radius: 12px;
      padding: 10px 12px;
      font: 16px Outfit, sans-serif;
      margin-bottom: 12px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 14px 16px;
      margin: 0 0 10px;
    }
    .card h3 { margin: 0; font-size: 18px; }
    .meta { color: var(--muted); font-size: 13px; margin-top: 4px; }
    .claims { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .pill {
      background: var(--green-soft);
      color: var(--green);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 600;
    }
    .pill.warn { background: #f8ead2; color: #8a5a12; }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 18px;
      padding: 28px;
      color: var(--muted);
    }
    code { font-size: 0.92em; }
    @media (max-width: 800px) {
      .stats, .layout { grid-template-columns: 1fr; }
      header { padding-top: 24px; }
    }
  </style>
</head>
<body>
  <header>
    <p class="kicker">Southwest London</p>
    <h1>Bangers &amp; Postcodes</h1>
    <p class="tagline">The best new music from your ends. Pick a London postcode and see who public data places round the corner, from Barnes to Wimbledon.</p>
    <div class="stats" id="stats"></div>
    <div class="rail" id="rail"></div>
  </header>
  <main>
    <div class="layout">
      <aside>
        <h2 id="heading">All postcodes</h2>
        <p class="note" id="blurb"></p>
        <input class="search" id="q" type="search" placeholder="Search artists" aria-label="Search artists">
      </aside>
      <section class="results" id="results"></section>
    </div>
  </main>
  <script id="payload" type="application/json">__PAYLOAD__</script>
  <script>
    const data = JSON.parse(document.getElementById("payload").textContent);
    const statsEl = document.getElementById("stats");
    const rail = document.getElementById("rail");
    const results = document.getElementById("results");
    const heading = document.getElementById("heading");
    const blurb = document.getElementById("blurb");
    const search = document.getElementById("q");
    let current = "all";

    function stat(value, label) {
      const el = document.createElement("div");
      el.className = "stat";
      const b = document.createElement("b");
      b.textContent = value;
      const s = document.createElement("span");
      s.textContent = label;
      el.append(b, s);
      return el;
    }

    const summary = data.stats || {};
    statsEl.append(
      stat(summary.artist_count ?? data.artists.length, "artists linked"),
      stat(summary.place_precision_count ?? "–", "tied to a postcode"),
      stat(summary.borough_precision_count ?? "–", "borough-level links"),
      stat(data.has_spotify ? (summary.spotify_matched ?? 0) : "–", data.has_spotify ? "Spotify matches" : "Spotify not run yet")
    );

    function addChip(id, title, subtitle) {
      const button = document.createElement("button");
      button.className = "postcode" + (id === current ? " active" : "");
      button.dataset.id = id;
      button.append(document.createTextNode(title));
      if (subtitle) {
        const small = document.createElement("small");
        small.textContent = subtitle;
        button.append(small);
      }
      button.addEventListener("click", () => { current = id; draw(); });
      rail.append(button);
    }

    addChip("all", "All", "SW London");
    for (const row of data.postcodes) addChip(row.postcode, row.postcode, row.places.join(", "));
    addChip("borough", "Boroughs", "wider than one postcode");

    function claimsFor(artist) {
      const pills = [];
      for (const place of artist.locality || []) {
        for (const claim of place.claims || []) {
          if (claim.source === "musicbrainz") {
            pills.push({ text: "MusicBrainz " + claim.field + ": " + claim.area_name, warn: place.precision === "borough" });
          } else {
            pills.push({ text: "Wikidata " + claim.field + ": " + place.place_name, warn: place.precision === "borough" });
          }
        }
      }
      return pills;
    }

    function visible(artist) {
      const query = search.value.trim().toLowerCase();
      if (query && !(artist.name || "").toLowerCase().includes(query)) return false;
      if (current === "all") return true;
      if (current === "borough") return (artist.locality || []).some((place) => place.precision === "borough");
      return (artist.locality || []).some((place) => place.precision === "place" && (place.postcodes || []).includes(current));
    }

    function draw() {
      for (const button of rail.querySelectorAll("button")) {
        button.classList.toggle("active", button.dataset.id === current);
      }
      const rows = data.artists.filter(visible);
      results.replaceChildren();
      if (current === "all") {
        heading.textContent = "All postcodes";
        blurb.textContent = "Everyone linked to Barnes, Putney, Richmond, Kingston, Wimbledon, Mortlake, Fulham, Wandsworth and the streets in between.";
      } else if (current === "borough") {
        heading.textContent = "Borough-level";
        blurb.textContent = "These claims name a whole borough. They can sit outside the postcode on the brief, so they stay separate from the postcode counts.";
      } else {
        const row = data.postcodes.find((item) => item.postcode === current);
        heading.textContent = current;
        blurb.textContent = row ? row.places.join(" · ") : "";
      }
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No artists for this filter yet. Locality only counts when MusicBrainz or Wikidata names the place.";
        results.append(empty);
        return;
      }
      for (const artist of rows) {
        const card = document.createElement("article");
        card.className = "card";
        const h3 = document.createElement("h3");
        h3.textContent = artist.name;
        const meta = document.createElement("div");
        meta.className = "meta";
        const bits = [];
        if (artist.type) bits.push(artist.type);
        const places = (artist.locality || []).map((place) => place.place_name);
        if (places.length) bits.push(places.join(", "));
        const spotify = artist.spotify;
        if (spotify) {
          const pop = spotify.popularity == null ? "popularity n/a" : "popularity " + spotify.popularity;
          const followers = spotify.followers == null ? "followers n/a" : spotify.followers.toLocaleString() + " followers";
          bits.push(pop, followers);
          if (spotify.representative_track) bits.push(spotify.representative_track.name);
        }
        meta.textContent = bits.join(" · ");
        const claims = document.createElement("div");
        claims.className = "claims";
        for (const pill of claimsFor(artist)) {
          const span = document.createElement("span");
          span.className = "pill" + (pill.warn ? " warn" : "");
          span.textContent = pill.text;
          claims.append(span);
        }
        card.append(h3, meta, claims);
        results.append(card);
      }
    }
    search.addEventListener("input", draw);
    draw();
  </script>
</body>
</html>
"""


def load_view(artists_path: str, run_path: str | None = None) -> dict:
    artists_file = Path(artists_path)
    run_file = Path(run_path) if run_path else None
    if run_file and run_file.is_file():
        document = json.loads(run_file.read_text())
        has_spotify = any(isinstance(artist.get("spotify"), dict) for artist in document.get("artists") or [])
    elif artists_file.is_file():
        document = json.loads(artists_file.read_text())
        has_spotify = False
    else:
        return {
            "missing": True,
            "artists_path": artists_path,
            "artists": [],
            "postcodes": [],
            "stats": {},
            "has_spotify": False,
        }
    artists = document.get("artists") or []
    stats = document.get("stats") or build_stats(artists)
    postcodes = []
    for row in stats.get("by_postcode") or []:
        names = []
        for place in document.get("places") or []:
            if row["postcode"] in (place.get("postcodes") or []) and place.get("name") not in names:
                names.append(place["name"])
        postcodes.append({"postcode": row["postcode"], "places": names, "artist_count": row["artist_count"]})
    return {
        "missing": False,
        "artists": artists,
        "postcodes": postcodes,
        "stats": stats,
        "has_spotify": has_spotify,
        "generated_at": document.get("generated_at"),
    }


def render_page(view: dict) -> str:
    if view.get("missing"):
        payload = {
            "artists": [],
            "postcodes": [],
            "stats": {"artist_count": 0, "place_precision_count": 0, "borough_precision_count": 0},
            "has_spotify": False,
        }
    else:
        payload = {
            "artists": view["artists"],
            "postcodes": view["postcodes"],
            "stats": view["stats"],
            "has_spotify": view["has_spotify"],
        }
    blob = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    return PAGE.replace("__PAYLOAD__", blob)


def serve(host: str, port: int, *, artists_path: str, run_path: str) -> None:
    view_paths = {"artists": artists_path, "run": run_path}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path not in {"/", "/index.html"}:
                self.send_error(404)
                return
            page = render_page(load_view(view_paths["artists"], view_paths["run"])).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(page)))
            self.end_headers()
            self.wfile.write(page)

        def log_message(self, fmt: str, *args) -> None:
            print(f"[{self.log_date_time_string()}] {args[0]}")

    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Bangers & Postcodes stats: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
