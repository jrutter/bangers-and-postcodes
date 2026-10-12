/** Place id plus the two rating fields. No Google photos, review text, or place payload. */
export const VENUE_RATINGS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS venue_google_ratings (
  venue_id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  rating DOUBLE PRECISION,
  user_rating_count INTEGER,
  fetched_at TIMESTAMPTZ NOT NULL
)`
