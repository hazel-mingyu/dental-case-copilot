export async function resolveCaseSummary({ supabase, input, caseId, model, fingerprint, generate, beforeGenerate }) {
  const fingerprintStartedAt = performance.now()
  const inputFingerprint = fingerprint(input)
  const { data: saved, error: savedError } = await supabase
    .from("case_summaries")
    .select("summary_mode,summary_json,input_fingerprint")
    .eq("case_id", caseId)
    .maybeSingle()
  if (savedError) throw savedError

  const fingerprint_ms = Math.round(performance.now() - fingerprintStartedAt)
  if (saved?.summary_json && saved.input_fingerprint === inputFingerprint) {
    return { kind: "reused", summary_mode: saved.summary_mode, summary: saved.summary_json, metrics: { fingerprint_ms, cache_hit: true, provider_ms: 0, provider_call_count: 0, validation_ms: 0, upsert_ms: 0, retry_count: 0 } }
  }

  if (!(await beforeGenerate())) {
    return { kind: "quota_exceeded", metrics: { fingerprint_ms, cache_hit: false, provider_ms: 0, provider_call_count: 0, validation_ms: 0, upsert_ms: 0, retry_count: 0 } }
  }

  const result = await generate(input)
  const generatedMetrics = { fingerprint_ms, cache_hit: false, provider_ms: result.provider_ms ?? 0, provider_call_count: result.provider_call_count ?? 0, validation_ms: result.validation_ms ?? 0, retry_count: result.retry_count ?? 0 }
  if (result.error || !result.parsed_summary_json || !result.automatic_contract_checks?.overall) return { kind: "contract_fail", metrics: { ...generatedMetrics, upsert_ms: 0 } }

  const upsertStartedAt = performance.now()
  const { error: persistenceError } = await supabase.from("case_summaries").upsert({ case_id: caseId, summary_mode: input.summary_mode, summary_json: result.parsed_summary_json, provider: "dashscope", model, input_fingerprint: inputFingerprint, updated_at: new Date().toISOString() }, { onConflict: "case_id" })
  if (persistenceError) throw persistenceError
  return { kind: "generated", summary_mode: input.summary_mode, summary: result.parsed_summary_json, metrics: { ...generatedMetrics, upsert_ms: Math.round(performance.now() - upsertStartedAt) } }
}
