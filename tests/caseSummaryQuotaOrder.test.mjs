import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { resolveCaseSummary } from "../lib/server/caseSummaryReuse.mjs"

const input = { case_id: "case-1", summary_mode: "initial", timepoints: [{ timepoint_id: "timepoint-1", sequence_order: 1, confirmed_text: "confirmed" }] }
const fingerprint = () => "fingerprint-1"
const summary = { case_overview: { content: "ok" } }

function reusableSupabase(saved) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: saved, error: null }) }) }),
      upsert: async () => ({ error: null }),
    }),
  }
}

test("cache hit skips quota gate and provider", async () => {
  let quotaCalls = 0, providerCalls = 0
  const result = await resolveCaseSummary({ supabase: reusableSupabase({ summary_mode: "initial", summary_json: summary, input_fingerprint: "fingerprint-1" }), input, caseId: "case-1", model: "model", fingerprint, beforeGenerate: async () => { quotaCalls += 1; return true }, generate: async () => { providerCalls += 1 } })
  assert.equal(result.kind, "reused")
  assert.equal(quotaCalls, 0)
  assert.equal(providerCalls, 0)
})

test("cache miss checks quota before one provider call", async () => {
  const sequence = []
  const result = await resolveCaseSummary({ supabase: reusableSupabase(null), input, caseId: "case-1", model: "model", fingerprint, beforeGenerate: async () => { sequence.push("quota"); return true }, generate: async () => { sequence.push("provider"); return { parsed_summary_json: summary, automatic_contract_checks: { overall: true }, error: null, provider_ms: 1, provider_call_count: 1, validation_ms: 1, retry_count: 0 } } })
  assert.equal(result.kind, "generated")
  assert.deepEqual(sequence, ["quota", "provider"])
})

test("quota rejection skips provider on cache miss", async () => {
  let providerCalls = 0
  const result = await resolveCaseSummary({ supabase: reusableSupabase(null), input, caseId: "case-1", model: "model", fingerprint, beforeGenerate: async () => false, generate: async () => { providerCalls += 1 } })
  assert.equal(result.kind, "quota_exceeded")
  assert.equal(providerCalls, 0)
})

test("ownership failure precedes reuse and quota in the route", async () => {
  const route = await readFile(new URL("../app/api/cases/[id]/summary/route.ts", import.meta.url), "utf8")
  const ownershipFailure = route.indexOf("if (caseError)")
  const reuse = route.lastIndexOf("resolveCaseSummary(")
  assert.ok(ownershipFailure >= 0 && reuse >= 0 && ownershipFailure < reuse)
})
