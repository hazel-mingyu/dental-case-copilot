import { createHash } from "node:crypto"

export function canonicalCaseSummaryProjection(input) {
  return {
    version: "case_summary_fingerprint_v1",
    case_id: input.case_id,
    summary_mode: input.summary_mode,
    timepoints: [...input.timepoints]
      .sort((left, right) => left.sequence_order - right.sequence_order || left.timepoint_id.localeCompare(right.timepoint_id))
      .map((timepoint) => ({ timepoint_id: timepoint.timepoint_id, sequence_order: timepoint.sequence_order, confirmed_text: timepoint.confirmed_text })),
  }
}

export function caseSummaryInputFingerprint(input) {
  return createHash("sha256").update(JSON.stringify(canonicalCaseSummaryProjection(input)), "utf8").digest("hex")
}
