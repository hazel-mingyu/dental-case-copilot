import "server-only"

import { createServerSupabaseClient } from "./supabase"

export type DailyApiQuotaOperation = "voice_transcribe" | "voice_extract_candidates" | "case_summary" | "case_ppt"

type DailyApiQuotaResult = {
  allowed: boolean
  used: number
  quota_limit: number
  remaining: number
}

export async function consumeDailyApiQuota(operation: DailyApiQuotaOperation) {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc("consume_daily_api_quota", { p_operation: operation })
  const result = Array.isArray(data) ? data[0] as DailyApiQuotaResult | undefined : undefined

  if (error || !result || typeof result.allowed !== "boolean") {
    throw new Error("Daily API quota check failed")
  }

  return result
}

export function dailyApiQuotaExceededResponse() {
  return Response.json({ ok: false, error: "今日使用次数已达上限，请明天再试" }, { status: 429 })
}
