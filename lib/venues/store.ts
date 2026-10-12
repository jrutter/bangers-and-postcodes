import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

import { VENUE_RATINGS_TABLE_SQL } from "@/lib/venues/schema"

export type RatingRow = {
  venueId: string
  placeId: string
  rating: number | null
  userRatingCount: number | null
  fetchedAt: string
}

export type RatingStore = {
  kind: "memory" | "file" | "postgres"
  read(): Promise<RatingRow[]>
  /** Upsert. Rows omitted here are left as they were. */
  write(rows: RatingRow[]): Promise<void>
  remove(venueIds: string[]): Promise<void>
}

const FILE_NAME = ".venue-ratings.json"

export function defaultRatingsFile(): string {
  return join(process.cwd(), "data", FILE_NAME)
}

export function memoryRatingStore(initial: RatingRow[] = []): RatingStore {
  const rows = new Map(initial.map((row) => [row.venueId, row]))
  return {
    kind: "memory",
    async read() {
      return [...rows.values()]
    },
    async write(next) {
      for (const row of next) rows.set(row.venueId, publicRow(row))
    },
    async remove(venueIds) {
      for (const id of venueIds) rows.delete(id)
    },
  }
}

export function fileRatingStore(filePath: string): RatingStore {
  return {
    kind: "file",
    async read() {
      return readRatingFile(filePath)
    },
    async write(next) {
      const rows = new Map(readRatingFile(filePath).map((row) => [row.venueId, row]))
      for (const row of next) rows.set(row.venueId, publicRow(row))
      writeFileSync(filePath, JSON.stringify({ rows: [...rows.values()] }))
    },
    async remove(venueIds) {
      const drop = new Set(venueIds)
      const rows = readRatingFile(filePath).filter((row) => !drop.has(row.venueId))
      writeFileSync(filePath, JSON.stringify({ rows }))
    },
  }
}

export function postgresUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.POSTGRES_URL || env.DATABASE_URL || "").trim()
}

const schemas = new Map<string, Promise<void>>()

export function neonRatingStore(connectionString: string): RatingStore {
  const sql = neon(connectionString)
  return {
    kind: "postgres",
    async read() {
      await ensureRatingsSchema(connectionString, sql)
      const rows = await sql`SELECT venue_id, place_id, rating, user_rating_count, fetched_at FROM venue_google_ratings`
      return rows.flatMap((row) => {
        const mapped = mapSql(row)
        return mapped ? [mapped] : []
      })
    },
    async write(next) {
      await ensureRatingsSchema(connectionString, sql)
      for (const row of next) {
        const stored = publicRow(row)
        await sql`INSERT INTO venue_google_ratings (venue_id, place_id, rating, user_rating_count, fetched_at)
          VALUES (${stored.venueId}, ${stored.placeId}, ${stored.rating}, ${stored.userRatingCount}, ${stored.fetchedAt})
          ON CONFLICT (venue_id) DO UPDATE SET
            place_id = EXCLUDED.place_id,
            rating = EXCLUDED.rating,
            user_rating_count = EXCLUDED.user_rating_count,
            fetched_at = EXCLUDED.fetched_at`
      }
    },
    async remove(venueIds) {
      await ensureRatingsSchema(connectionString, sql)
      for (const id of venueIds) {
        await sql`DELETE FROM venue_google_ratings WHERE venue_id = ${id}`
      }
    },
  }
}

export function ratingStoreFor(env: NodeJS.ProcessEnv, filePath = defaultRatingsFile()): RatingStore {
  const url = postgresUrl(env)
  if (url) return neonRatingStore(url)
  if (env.VERCEL) return memoryRatingStore()
  return fileRatingStore(filePath)
}

function publicRow(row: RatingRow): RatingRow {
  return {
    venueId: row.venueId,
    placeId: row.placeId,
    rating: row.rating,
    userRatingCount: row.userRatingCount,
    fetchedAt: row.fetchedAt,
  }
}

export function readRatingFile(filePath: string): RatingRow[] {
  let text: string
  try {
    text = readFileSync(filePath, "utf8")
  } catch {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const record = parsed && typeof parsed === "object" ? (parsed as { rows?: unknown }) : null
  if (!record || !Array.isArray(record.rows)) return []
  return record.rows.flatMap((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : null
    if (!row) return []
    const venueId = typeof row.venueId === "string" ? row.venueId : ""
    const placeId = typeof row.placeId === "string" ? row.placeId : ""
    if (!venueId || !placeId) return []
    const rating = typeof row.rating === "number" && Number.isFinite(row.rating) ? row.rating : null
    const userRatingCount =
      typeof row.userRatingCount === "number" && Number.isFinite(row.userRatingCount) ? Math.round(row.userRatingCount) : null
    const fetchedAt = typeof row.fetchedAt === "string" ? row.fetchedAt : ""
    if (!fetchedAt) return []
    return [{ venueId, placeId, rating, userRatingCount, fetchedAt }]
  })
}

function mapSql(row: Record<string, unknown>): RatingRow | null {
  const venueId = typeof row.venue_id === "string" ? row.venue_id : ""
  const placeId = typeof row.place_id === "string" ? row.place_id : ""
  if (!venueId || !placeId) return null
  const rating = typeof row.rating === "number" && Number.isFinite(row.rating) ? row.rating : null
  const count = row.user_rating_count
  const userRatingCount = typeof count === "number" && Number.isFinite(count) ? Math.round(count) : null
  const fetched = row.fetched_at
  const parsed = fetched instanceof Date ? fetched : new Date(String(fetched ?? ""))
  if (Number.isNaN(parsed.getTime())) return null
  return { venueId, placeId, rating, userRatingCount, fetchedAt: parsed.toISOString() }
}

function ensureRatingsSchema(connectionString: string, sql: NeonQueryFunction<false, false>): Promise<void> {
  const existing = schemas.get(connectionString)
  if (existing) return existing
  const pending = sql.query(VENUE_RATINGS_TABLE_SQL).then(() => undefined)
  schemas.set(connectionString, pending)
  return pending
}
