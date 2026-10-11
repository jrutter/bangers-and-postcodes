"use server"

import { grantPreviewCookie } from "@/lib/newsletter/preview-auth"

export type PreviewUnlock = { ok: boolean }

export async function unlockPreview(_prev: PreviewUnlock | null, formData: FormData): Promise<PreviewUnlock> {
  const ok = await grantPreviewCookie(String(formData.get("secret") || ""))
  return { ok }
}
