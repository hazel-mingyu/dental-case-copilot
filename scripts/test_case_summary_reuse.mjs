import assert from "node:assert/strict"
import { caseSummaryInputFingerprint } from "../lib/server/caseSummaryFreshness.mjs"
import { resolveCaseSummary } from "../lib/server/caseSummaryReuse.mjs"

const base = { case_id: "case-1", summary_mode: "ongoing", timepoints: [{ timepoint_id: "tp-1", sequence_order: 1, captured_on: "2026-08-14", confirmed_text: "确认事实" }] }
const summary = { case_overview: { content: "已保存总结" } }
const copy = (value) => JSON.parse(JSON.stringify(value))
function fakeSupabase(saved) { const writes = []; return { writes, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: saved, error: null }) }) }), upsert: async (row) => { writes.push(row); return { error: null } } }) } }
function generator(result) { let calls = 0; return { calls: () => calls, generate: async () => { calls += 1; return result } } }
const passed = { error: null, parsed_summary_json: summary, automatic_contract_checks: { overall: true } }
async function resolve(input, saved, result = passed) { const supabase = fakeSupabase(saved), provider = generator(result), output = await resolveCaseSummary({ supabase, input, caseId: input.case_id, model: "model-1", fingerprint: caseSummaryInputFingerprint, generate: provider.generate }); return { output, providerCalls: provider.calls(), writes: supabase.writes } }

const matching = await resolve(base, { summary_mode: "ongoing", summary_json: summary, input_fingerprint: caseSummaryInputFingerprint(base) })
assert.equal(matching.output.kind, "reused"); assert.equal(matching.providerCalls, 0); assert.equal(matching.writes.length, 0)

const dateChanged = copy(base); dateChanged.timepoints[0].captured_on = "2026-09-01"
const unchangedDate = await resolve(dateChanged, { summary_mode: "ongoing", summary_json: summary, input_fingerprint: caseSummaryInputFingerprint(base) })
assert.equal(unchangedDate.output.kind, "reused"); assert.equal(unchangedDate.providerCalls, 0)

const textChanged = copy(base); textChanged.timepoints[0].confirmed_text = "修改后的确认事实"
const changedText = await resolve(textChanged, { summary_mode: "ongoing", summary_json: summary, input_fingerprint: caseSummaryInputFingerprint(base) })
assert.equal(changedText.output.kind, "generated"); assert.equal(changedText.providerCalls, 1); assert.equal(changedText.writes[0].input_fingerprint, caseSummaryInputFingerprint(textChanged))

const modeChanged = copy(base); modeChanged.summary_mode = "completed"
const changedMode = await resolve(modeChanged, { summary_mode: "ongoing", summary_json: summary, input_fingerprint: caseSummaryInputFingerprint(base) })
assert.equal(changedMode.output.kind, "generated"); assert.equal(changedMode.providerCalls, 1)

const nullFingerprint = await resolve(base, { summary_mode: "ongoing", summary_json: summary, input_fingerprint: null })
assert.equal(nullFingerprint.output.kind, "generated"); assert.equal(nullFingerprint.providerCalls, 1)

const contractFail = await resolve(base, { summary_mode: "ongoing", summary_json: summary, input_fingerprint: null }, { error: "timeline_completeness", parsed_summary_json: summary, automatic_contract_checks: { overall: false } })
assert.equal(contractFail.output.kind, "contract_fail"); assert.equal(contractFail.providerCalls, 1); assert.equal(contractFail.writes.length, 0)

console.log("case_summary_reuse: PASS")
