import { NextResponse } from "next/server"
import { getCurrentUser } from "../../../../../lib/server/auth"
import { createServerSupabaseClient } from "../../../../../lib/server/supabase"
import { buildCaseSummaryInput } from "../../../../../lib/server/caseSummaryInput.mjs"
import { CASE_SUMMARY_MODEL, generateCaseSummary } from "../../../../../lib/server/caseSummaryGeneration.mjs"
import { caseSummaryInputFingerprint } from "../../../../../lib/server/caseSummaryFreshness.mjs"
import { resolveCaseSummary } from "../../../../../lib/server/caseSummaryReuse.mjs"

export const dynamic = "force-dynamic"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  } catch {
    console.error("Case summary authentication failed")
    return NextResponse.json({ error: "病例总结生成失败，请稍后重试。" }, { status: 500 })
  }

  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: caseData, error: caseError } = await supabase.from("cases").select("id").eq("id", id).maybeSingle()
    if (caseError) { console.error("Case summary case lookup failed"); return NextResponse.json({ error: "病例总结生成失败，请稍后重试。" }, { status: 500 }) }
    if (!caseData) return NextResponse.json({ error: "资源不存在" }, { status: 404 })
    const input = await buildCaseSummaryInput(supabase, id)
    if (!input.timepoints.length) return NextResponse.json({ error: "暂无可用于生成总结的已确认病例记录" }, { status: 400 })
    const result = await resolveCaseSummary({ supabase, input, caseId: id, model: CASE_SUMMARY_MODEL, fingerprint: caseSummaryInputFingerprint, generate: generateCaseSummary })
    if (result.kind === "contract_fail") return NextResponse.json({ error: "本次病例总结未通过一致性校验，请重新生成。" }, { status: 422 })
    return NextResponse.json({ summary_mode: result.summary_mode, summary: result.summary })
  } catch {
    console.error("Case summary generation failed")
    return NextResponse.json({ error: "病例总结生成失败，请稍后重试。" }, { status: 500 })
  }
}
