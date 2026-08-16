import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "../../../../../lib/server/supabase"
import { buildCaseSummaryInput } from "../../../../../lib/server/caseSummaryInput.mjs"
import { CASE_SUMMARY_MODEL, generateCaseSummary } from "../../../../../lib/server/caseSummaryGeneration.mjs"
import { caseSummaryInputFingerprint } from "../../../../../lib/server/caseSummaryFreshness.mjs"
import { resolveCaseSummary } from "../../../../../lib/server/caseSummaryReuse.mjs"

export const dynamic = "force-dynamic"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = createServerSupabaseClient()
    const input = await buildCaseSummaryInput(supabase, id)
    if (!input.timepoints.length) return NextResponse.json({ error: "暂无可用于生成总结的已确认病例记录" }, { status: 400 })
    const result = await resolveCaseSummary({ supabase, input, caseId: id, model: CASE_SUMMARY_MODEL, fingerprint: caseSummaryInputFingerprint, generate: generateCaseSummary })
    if (result.kind === "contract_fail") return NextResponse.json({ error: "本次病例总结未通过一致性校验，请重新生成。" }, { status: 422 })
    return NextResponse.json({ summary_mode: result.summary_mode, summary: result.summary })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "病例总结生成失败" }, { status: 500 })
  }
}
