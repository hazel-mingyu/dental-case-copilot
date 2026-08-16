import assert from "node:assert/strict"
import { canonicalCaseSummaryProjection, caseSummaryInputFingerprint } from "../lib/server/caseSummaryFreshness.mjs"

const base = {
  case_id: "case-1",
  summary_mode: "ongoing",
  timepoints: [
    { timepoint_id: "tp-2", sequence_order: 2, captured_on: "2026-08-14", confirmed_text: "第二次确认事实" },
    { timepoint_id: "tp-1", sequence_order: 1, captured_on: "2026-08-13", confirmed_text: "第一次确认事实" },
  ],
}
const copy = (value) => JSON.parse(JSON.stringify(value))
const fingerprint = caseSummaryInputFingerprint(base)

assert.equal(fingerprint, caseSummaryInputFingerprint(copy(base)))
assert.deepEqual(canonicalCaseSummaryProjection(base).timepoints.map((timepoint) => timepoint.timepoint_id), ["tp-1", "tp-2"])

const dateChanged = copy(base)
dateChanged.timepoints[0].captured_on = "2026-09-01"
assert.equal(fingerprint, caseSummaryInputFingerprint(dateChanged))

const textChanged = copy(base)
textChanged.timepoints[0].confirmed_text = "已修改确认事实"
assert.notEqual(fingerprint, caseSummaryInputFingerprint(textChanged))

const modeChanged = copy(base)
modeChanged.summary_mode = "completed"
assert.notEqual(fingerprint, caseSummaryInputFingerprint(modeChanged))

const addedTimepoint = copy(base)
addedTimepoint.timepoints.push({ timepoint_id: "tp-3", sequence_order: 3, captured_on: "2026-08-15", confirmed_text: "新增确认事实" })
assert.notEqual(fingerprint, caseSummaryInputFingerprint(addedTimepoint))

const removedTimepoint = copy(base)
removedTimepoint.timepoints.pop()
assert.notEqual(fingerprint, caseSummaryInputFingerprint(removedTimepoint))

console.log("case_summary_freshness: PASS")
