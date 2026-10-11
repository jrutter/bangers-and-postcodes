export type Precision = "place" | "borough"

export type Claim = {
  source: string
  field: string
  area_mbid?: string | null
  area_name?: string | null
  wikidata_qid?: string | null
  place_name?: string | null
}

export type Locality = {
  place_id: string
  place_name: string
  postcodes: string[]
  precision: Precision | string
  claims: Claim[]
}

export type PlaceRecord = {
  id: string
  name: string
  postcodes: string[]
  precision: Precision | string
  musicbrainz_area_mbid: string | null
  musicbrainz_area_name: string | null
  wikidata_qid: string | null
  note: string
}

export type ArtistRecord = {
  mbid: string | null
  wikidata_qid: string | null
  name: string
  sort_name: string | null
  type: string | null
  disambiguation: string | null
  country: string | null
  life_span: {
    begin: string | null
    end: string | null
    ended: boolean | null
  } | null
  tags: string[]
  locality: Locality[]
}

export type SpotifyTrack = {
  id: string | null
  name: string | null
  uri: string
  preview_url: string | null
  album: string | null
  popularity: number | null
}

export type SpotifyProfile = {
  id: string
  name: string | null
  url: string | null
  followers: number | null
  popularity: number | null
  image: string | null
  match: "exact"
  representative_track: SpotifyTrack | null
}

export type MatchedArtist = ArtistRecord & {
  spotify?: SpotifyProfile | null
  spotify_error?: string
}

export type Catalogue = {
  project: string
  description: string
  generated_at: string
  places: PlaceRecord[]
  artists: ArtistRecord[]
  artist_count: number
}

export type TokenBundle = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}
