/**
 * Subscriber rows keep the address, the chosen postcode districts, consent
 * timestamps, and a hashed one-time confirm token. Preference links are HMAC
 * derived and are not stored. The send ledger is the idempotency record.
 * No Spotify profile, taste, IP address, or user agent.
 */
export const SUBSCRIBER_TABLE_SQL = `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  areas TEXT NOT NULL,
  status TEXT NOT NULL,
  consent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  confirm_token_hash TEXT,
  confirm_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL
)`

export const SUBSCRIBER_CONFIRM_INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_confirm_hash
  ON newsletter_subscribers (confirm_token_hash)
  WHERE confirm_token_hash IS NOT NULL`

export const SEND_TABLE_SQL = `CREATE TABLE IF NOT EXISTS newsletter_sends (
  subscriber_id TEXT NOT NULL REFERENCES newsletter_subscribers (id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (subscriber_id, week_key)
)`
