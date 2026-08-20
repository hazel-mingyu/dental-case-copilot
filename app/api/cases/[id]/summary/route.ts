import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { getCurrentUser } from "../../../../../lib/server/auth"
import { consumeDailyApiQuota, dailyApiQuotaExceededResponse } from "../../../../../lib/server/dailyApiQuota"
import { createServerSupabaseClient } from "../../../../../lib/server/supabase"
import { buildCaseSummaryInput } from "../../../../../lib/server/caseSummaryInput.mjs"
import { CASE_SUMMARY_MODEL, generateCaseSummary } from "../../../../../lib/server/caseSummaryGeneration.mjs"
import { caseSummaryInputFingerprint } from "../../../../../lib/server/caseSummaryFreshness.mjs"
import { resolveCaseSummary } from "../../../../../lib/server/caseSummaryReuse.mjs"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 200

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const totalStartedAt = performance.now()
  const request_id = randomUUID().slice(0, 8)
  const metrics = { auth_ms: 0, ownership_ms: 0, quota_ms: 0, quota_checked: false, input_build_ms: 0, fingerprint_ms: 0, cache_hit: false, provider_ms: 0, provider_call_count: 0, validation_ms: 0, upsert_ms: 0, retry_count: 0 }
  const logPerformance = () => console.info("Case summary performance", { request_id, ...metrics, total_ms: Math.round(performance.now() - totalStartedAt) })
  try {
    const authStartedAt = performance.now(), user = await getCurrentUser()
    metrics.auth_ms = Math.round(performance.now() - authStartedAt)
    if (!user) { logPerformance(); return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 }) }
  } catch {
    console.error("Case summary authentication failed")
    logPerformance()
    return NextResponse.json({ error: "病例总结生成失败，请稍后重试。" }, { status: 500 })
  }

  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const ownershipStartedAt = performance.now()
    const { data: caseData, error: caseError } = await supabase.from("cases").select("id").eq("id", id).maybeSingle()
    metrics.ownership_ms = Math.round(performance.now() - ownershipStartedAt)
    if (caseError) { console.error("Case summary case lookup failed"); return NextResponse.json({ error: "病例总结生成失败，请稍后重试。" }, { status: 500 }) }
    if (!caseData) return NextResponse.json({ error: "资源不存在" }, { status: 404 })
    const inputBuildStartedAt = performance.now()
    const input = await buildCaseSummaryInput(supabase, id)
    metrics.input_build_ms = Math.round(performance.now() - inputBuildStartedAt)
    if (!input.timepoints.length) return NextResponse.json({ error: "暂无可用于生成总结的已确认病例记录" }, { status: 400 })
    const result = await resolveCaseSummary({ supabase, input, caseId: id, model: CASE_SUMMARY_MODEL, fingerprint: caseSummaryInputFingerprint, generate: generateCaseSummary, beforeGenerate: async () => {
      try {
        const quotaStartedAt = performance.now()
        const quota = await consumeDailyApiQuota("case_summary")
        metrics.quota_ms = Math.round(performance.now() - quotaStartedAt)
        metrics.quota_checked = true
        return quota.allowed
      } catch {
        console.error("Case summary quota check failed")
        throw new Error("Case summary quota check failed")
      }
    } })
    Object.assign(metrics, result.metrics)
    if (result.kind === "quota_exceeded") return dailyApiQuotaExceededResponse()
    if (result.kind === "contract_fail") return NextResponse.json({ error: "本次病例总结未通过一致性校验，请重新生成。" }, { status: 422 })
    return NextResponse.json({ summary_mode: result.summary_mode, summary: result.summary })
  } catch {
    console.error("Case summary generation failed")
    return NextResponse.json({ error: "病例总结生成失败，请稍后重试。" }, { status: 500 })
  } finally {
    logPerformance()
  }
}
