import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

import { SEND_TABLE_SQL, SUBSCRIBER_CONFIRM_INDEX_SQL, SUBSCRIBER_TABLE_SQL } from "@/lib/newsletter/schema"

export type SubscriberStatus = "pending" | "confirmed" | "unsubscribed"
export type SendStatus = "sending" | "sent" | "skipped" | "failed"

export type Subscriber = {
  id: string
  email: string
  areas: string[]
  status: SubscriberStatus
  consentAt: string | null
  confirmedAt: string | null
  unsubscribedAt: string | null
}

export type PendingWrite = {
  id: string
  email: string
  areas: string[]
  consentAt: string
  confirmTokenHash: string
  confirmExpiresAt: string
}

export type SubscriberStore = {
  ensure(): Promise<void>
  findByEmail(email: string): Promise<Subscriber | null>
  findById(id: string): Promise<Subscriber | null>
  insertPending(row: PendingWrite): Promise<void>
  /** Refresh a pending or unsubscribed row. Confirmed rows are left alone. */
  revivePending(row: PendingWrite): Promise<boolean>
  confirm(hash: string, now: string): Promise<Subscriber | null>
  markUnsubscribed(id: string, now: string): Promise<boolean>
  updateAreas(id: string, areas: string[], now: string): Promise<boolean>
  listConfirmed(): Promise<Subscriber[]>
  listSends(weekKey: string): Promise<{ subscriberId: string; status: SendStatus }[]>
  /**
   * Claim a send slot. `sent` and `skipped` stay claimed.
   * `sending` and `failed` can be taken again so a crashed run can retry.
   * The caller pairs a retry with a stable Resend idempotency key.
   */
  claimSend(subscriberId: string, weekKey: string, now: Date): Promise<"claimed" | "already">
  finishSend(subscriberId: string, weekKey: string, status: "sent" | "skipped" | "failed", now: Date): Promise<void>
}

type MemoryRow = Subscriber & {
  confirmTokenHash: string | null
  confirmExpiresAt: string | null
  updatedAt: string
}

export function memoryStore(): SubscriberStore {
  const rows = new Map<string, MemoryRow>()
  const byEmail = new Map<string, string>()
  const sends = new Map<string, { subscriberId: string; weekKey: string; status: SendStatus; updatedAt: string }>()

  function publicRow(row: MemoryRow): Subscriber {
    return {
      id: row.id,
      email: row.email,
      areas: [...row.areas],
      status: row.status,
      consentAt: row.consentAt,
      confirmedAt: row.confirmedAt,
      unsubscribedAt: row.unsubscribedAt,
    }
  }

  return {
    async ensure() {},
    async findByEmail(email) {
      const id = byEmail.get(email)
      const row = id ? rows.get(id) : undefined
      return row ? publicRow(row) : null
    },
    async findById(id) {
      const row = rows.get(id)
      return row ? publicRow(row) : null
    },
    async insertPending(input) {
      if (byEmail.has(input.email)) throw new Error("Email is already on the list.")
      rows.set(input.id, {
        id: input.id,
        email: input.email,
        areas: [...input.areas],
        status: "pending",
        consentAt: input.consentAt,
        confirmedAt: null,
        unsubscribedAt: null,
        confirmTokenHash: input.confirmTokenHash,
        confirmExpiresAt: input.confirmExpiresAt,
        updatedAt: input.consentAt,
      })
      byEmail.set(input.email, input.id)
    },
    async revivePending(input) {
      const row = rows.get(input.id)
      if (!row || row.status === "confirmed") return false
      row.areas = [...input.areas]
      row.status = "pending"
      row.consentAt = input.consentAt
      row.confirmedAt = null
      row.unsubscribedAt = null
      row.confirmTokenHash = input.confirmTokenHash
      row.confirmExpiresAt = input.confirmExpiresAt
      row.updatedAt = input.consentAt
      return true
    },
    async confirm(hash, now) {
      for (const row of rows.values()) {
        if (row.confirmTokenHash !== hash || row.status !== "pending") continue
        if (!row.confirmExpiresAt || row.confirmExpiresAt <= now) return null
        row.status = "confirmed"
        row.confirmedAt = now
        row.confirmTokenHash = null
        row.confirmExpiresAt = null
        row.updatedAt = now
        return publicRow(row)
      }
      return null
    },
    async markUnsubscribed(id, now) {
      const row = rows.get(id)
      if (!row) return false
      row.status = "unsubscribed"
      row.unsubscribedAt = now
      row.confirmTokenHash = null
      row.confirmExpiresAt = null
      row.updatedAt = now
      return true
    },
    async updateAreas(id, areas, now) {
      const row = rows.get(id)
      if (!row || row.status !== "confirmed") return false
      row.areas = [...areas]
      row.updatedAt = now
      return true
    },
    async listConfirmed() {
      return [...rows.values()].filter((row) => row.status === "confirmed").map(publicRow)
    },
    async listSends(weekKey) {
      return [...sends.values()]
        .filter((send) => send.weekKey === weekKey)
        .map((send) => ({ subscriberId: send.subscriberId, status: send.status }))
    },
    async claimSend(subscriberId, weekKey, now) {
      const key = `${subscriberId}:${weekKey}`
      const existing = sends.get(key)
      if (!existing) {
        sends.set(key, { subscriberId, weekKey, status: "sending", updatedAt: now.toISOString() })
        return "claimed"
      }
      if (existing.status === "sent" || existing.status === "skipped") return "already"
      existing.status = "sending"
      existing.updatedAt = now.toISOString()
      return "claimed"
    },
    async finishSend(subscriberId, weekKey, status, now) {
      const key = `${subscriberId}:${weekKey}`
      const existing = sends.get(key)
      if (!existing) return
      existing.status = status
      existing.updatedAt = now.toISOString()
    },
  }
}

const schemas = new Map<string, Promise<void>>()

export function neonStore(connectionString: string): SubscriberStore {
  const sql = neon(connectionString)
  return {
    ensure: () => ensureSchema(connectionString, sql),
    findByEmail: async (email) => {
      const rows = await sql`SELECT id, email, areas, status, consent_at, confirmed_at, unsubscribed_at
        FROM newsletter_subscribers WHERE email = ${email} LIMIT 1`
      return rows[0] ? mapSubscriber(rows[0]) : null
    },
    findById: async (id) => {
      const rows = await sql`SELECT id, email, areas, status, consent_at, confirmed_at, unsubscribed_at
        FROM newsletter_subscribers WHERE id = ${id} LIMIT 1`
      return rows[0] ? mapSubscriber(rows[0]) : null
    },
    insertPending: async (input) => {
      await sql`INSERT INTO newsletter_subscribers (
        id, email, areas, status, consent_at, confirmed_at, unsubscribed_at, confirm_token_hash, confirm_expires_at, updated_at
      ) VALUES (
        ${input.id},
        ${input.email},
        ${input.areas.join(",")},
        'pending',
        ${input.consentAt},
        NULL,
        NULL,
        ${input.confirmTokenHash},
        ${input.confirmExpiresAt},
        ${input.consentAt}
      )`
    },
    revivePending: async (input) => {
      const rows = await sql`UPDATE newsletter_subscribers
        SET areas = ${input.areas.join(",")},
            status = 'pending',
            consent_at = ${input.consentAt},
            confirmed_at = NULL,
            unsubscribed_at = NULL,
            confirm_token_hash = ${input.confirmTokenHash},
            confirm_expires_at = ${input.confirmExpiresAt},
            updated_at = ${input.consentAt}
        WHERE id = ${input.id} AND status <> 'confirmed'
        RETURNING id`
      return rows.length > 0
    },
    confirm: async (hash, now) => {
      const rows = await sql`UPDATE newsletter_subscribers
        SET status = 'confirmed',
            confirmed_at = ${now},
            confirm_token_hash = NULL,
            confirm_expires_at = NULL,
            updated_at = ${now}
        WHERE confirm_token_hash = ${hash}
          AND status = 'pending'
          AND confirm_expires_at > ${now}
        RETURNING id, email, areas, status, consent_at, confirmed_at, unsubscribed_at`
      return rows[0] ? mapSubscriber(rows[0]) : null
    },
    markUnsubscribed: async (id, now) => {
      const rows = await sql`UPDATE newsletter_subscribers
        SET status = 'unsubscribed',
            unsubscribed_at = ${now},
            confirm_token_hash = NULL,
            confirm_expires_at = NULL,
            updated_at = ${now}
        WHERE id = ${id}
        RETURNING id`
      return rows.length > 0
    },
    updateAreas: async (id, areas, now) => {
      const rows = await sql`UPDATE newsletter_subscribers
        SET areas = ${areas.join(",")}, updated_at = ${now}
        WHERE id = ${id} AND status = 'confirmed'
        RETURNING id`
      return rows.length > 0
    },
    listConfirmed: async () => {
      const rows = await sql`SELECT id, email, areas, status, consent_at, confirmed_at, unsubscribed_at
        FROM newsletter_subscribers WHERE status = 'confirmed' ORDER BY email`
      return rows.map((row) => mapSubscriber(row))
    },
    listSends: async (weekKey) => {
      const rows = await sql`SELECT subscriber_id, status FROM newsletter_sends WHERE week_key = ${weekKey}`
      return rows.map((row) => ({
        subscriberId: String(row.subscriber_id),
        status: row.status as SendStatus,
      }))
    },
    claimSend: async (subscriberId, weekKey, now) => {
      const stamp = now.toISOString()
      const rows = await sql`INSERT INTO newsletter_sends (subscriber_id, week_key, status, updated_at)
        VALUES (${subscriberId}, ${weekKey}, 'sending', ${stamp})
        ON CONFLICT (subscriber_id, week_key) DO UPDATE
          SET status = 'sending', updated_at = ${stamp}
          WHERE newsletter_sends.status IN ('failed', 'sending')
        RETURNING subscriber_id`
      return rows.length > 0 ? "claimed" : "already"
    },
    finishSend: async (subscriberId, weekKey, status, now) => {
      await sql`UPDATE newsletter_sends
        SET status = ${status}, updated_at = ${now.toISOString()}
        WHERE subscriber_id = ${subscriberId} AND week_key = ${weekKey}`
    },
  }
}

function ensureSchema(connectionString: string, sql: NeonQueryFunction<false, false>): Promise<void> {
  const existing = schemas.get(connectionString)
  if (existing) return existing
  const pending = migrate(sql).catch((error: unknown) => {
    schemas.delete(connectionString)
    throw error
  })
  schemas.set(connectionString, pending)
  return pending
}

async function migrate(sql: NeonQueryFunction<false, false>): Promise<void> {
  await sql.query(SUBSCRIBER_TABLE_SQL)
  await sql.query(SUBSCRIBER_CONFIRM_INDEX_SQL)
  await sql.query(SEND_TABLE_SQL)
}

function mapSubscriber(row: Record<string, unknown>): Subscriber {
  return {
    id: String(row.id),
    email: String(row.email),
    areas: String(row.areas || "")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean),
    status: row.status as SubscriberStatus,
    consentAt: instant(row.consent_at),
    confirmedAt: instant(row.confirmed_at),
    unsubscribedAt: instant(row.unsubscribed_at),
  }
}

function instant(value: unknown): string | null {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

let cachedStore: SubscriberStore | null = null
let cachedUrl = ""

export function getStore(env: NodeJS.ProcessEnv = process.env): SubscriberStore | null {
  const url = (env.POSTGRES_URL || env.DATABASE_URL || "").trim()
  if (!url) return null
  if (cachedStore && cachedUrl === url) return cachedStore
  cachedUrl = url
  cachedStore = neonStore(url)
  return cachedStore
}
