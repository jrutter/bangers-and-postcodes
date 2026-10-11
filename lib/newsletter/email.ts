import { newsletterEnv } from "@/lib/newsletter/config"

export type OutboundEmail = {
  to: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

export type EmailClient = {
  send(messages: OutboundEmail[], idempotencyKey: string): Promise<void>
}

export function recordingEmailClient(): EmailClient & { messages: OutboundEmail[]; keys: string[] } {
  const messages: OutboundEmail[] = []
  const keys: string[] = []
  return {
    messages,
    keys,
    async send(batch, idempotencyKey) {
      keys.push(idempotencyKey)
      messages.push(...batch)
    },
  }
}

/**
 * Tests must pass a mock. This throws before the Resend SDK is constructed
 * whenever the process, or the provided env, is a test run.
 */
export async function createEmailClient(env: NodeJS.ProcessEnv = process.env): Promise<EmailClient> {
  if (process.env.NODE_ENV === "test" || env.NODE_ENV === "test") {
    throw new Error("Refusing to create a live email client during tests. Pass a mock EmailClient.")
  }
  const cfg = newsletterEnv(env)
  if (!cfg.resendKey || !cfg.from) throw new Error("Email provider is not configured.")
  const { Resend } = await import("resend")
  const resend = new Resend(cfg.resendKey)
  const from = cfg.from
  return {
    async send(messages, idempotencyKey) {
      if (messages.length === 0) return
      const result = await resend.batch.send(
        messages.map((message) => ({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
        })),
        { idempotencyKey },
      )
      if (result.error) {
        throw new Error(result.error.message || "Resend rejected the batch.")
      }
    },
  }
}
