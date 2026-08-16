export async function resolveCaseSummary({ supabase, input, caseId, model, fingerprint, generate }) {
  const inputFingerprint = fingerprint(input)
  const { data: saved, error: savedError } = await supabase
    .from("case_summaries")
    .select("summary_mode,summary_json,input_fingerprint")
    .eq("case_id", caseId)
    .maybeSingle()
  if (savedError) throw savedError

  if (saved?.summary_json && saved.input_fingerprint === inputFingerprint) {
    return { kind: "reused", summary_mode: saved.summary_mode, summary: saved.summary_json }
  }

  const result = await generate(input)
  if (result.error || !result.parsed_summary_json || !result.automatic_contract_checks?.overall) return { kind: "contract_fail" }

  const { error: persistenceError } = await supabase.from("case_summaries").upsert({ case_id: caseId, summary_mode: input.summary_mode, summary_json: result.parsed_summary_json, provider: "dashscope", model, input_fingerprint: inputFingerprint, updated_at: new Date().toISOString() }, { onConflict: "case_id" })
  if (persistenceError) throw persistenceError
  return { kind: "generated", summary_mode: input.summary_mode, summary: result.parsed_summary_json }
}
