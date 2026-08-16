import { z } from "zod"

export const CASE_SUMMARY_MODEL = "qwen3.7-plus-2026-05-26"
export const treatmentStageSchema = z.enum(["initial", "ongoing", "completed"])
export const summaryModeSchema = treatmentStageSchema
export type SummaryMode = z.infer<typeof summaryModeSchema>
export const sectionKeySchema = z.enum(["initial_status", "treatment_actions", "key_changes", "current_status", "final_outcome", "completion_summary", "follow_up_focus", "post_treatment_follow_up"])
export type SectionKey = z.infer<typeof sectionKeySchema>

export const allowedSections: Record<SummaryMode, readonly SectionKey[]> = {
  initial: ["initial_status", "treatment_actions", "follow_up_focus"],
  ongoing: ["initial_status", "treatment_actions", "key_changes", "current_status", "follow_up_focus"],
  completed: ["initial_status", "treatment_actions", "key_changes", "final_outcome", "completion_summary", "post_treatment_follow_up"],
}
const factSchema = z.object({ content: z.string().min(1), source_timepoint_ids: z.array(z.string()).min(1) }).strict()
const timelineSchema = z.object({ timepoint_id: z.string(), captured_on: z.string(), stage: treatmentStageSchema, content: z.string().min(1), source_timepoint_ids: z.array(z.string()).min(1) }).strict()

export type GeneratedSummary = { case_overview: z.infer<typeof factSchema>; treatment_timeline: z.infer<typeof timelineSchema>[]; sections_by_key: Partial<Record<SectionKey, z.infer<typeof factSchema>[]>> }
export type CaseSummary = GeneratedSummary & { summary_mode: SummaryMode; sections: { key: SectionKey; items: z.infer<typeof factSchema>[] }[] }

const factJsonSchema = () => ({ type: "object", additionalProperties: false, properties: { content: { type: "string" }, source_timepoint_ids: { type: "array", minItems: 1, items: { type: "string" } } }, required: ["content", "source_timepoint_ids"] })
export function caseSummaryGenerationJsonSchema(mode: SummaryMode) {
  const properties: Record<string, unknown> = {
    case_overview: factJsonSchema(),
    treatment_timeline: { type: "array", items: { type: "object", additionalProperties: false, properties: { timepoint_id: { type: "string" }, captured_on: { type: "string" }, stage: { type: "string", enum: ["initial", "ongoing", "completed"] }, content: { type: "string" }, source_timepoint_ids: { type: "array", minItems: 1, items: { type: "string" } } }, required: ["timepoint_id", "captured_on", "stage", "content", "source_timepoint_ids"] } },
  }
  for (const key of allowedSections[mode]) properties[key] = { type: "array", items: factJsonSchema() }
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) }
}

export const CASE_SUMMARY_PROMPT_VERSION = "case_summary_v1"
export const CASE_SUMMARY_PROMPT = `Generate a Chinese orthodontic case-summary candidate from only supplied doctor-confirmed facts. Do not add diagnoses, outcomes, recommendations, or facts not explicitly recorded. Every non-empty fact needs existing source_timepoint_ids. Absence of evidence is neither persistence nor improvement. current_status/final_outcome need the most recent record explicitly supporting the fact. Cross-time change needs earlier and later explicit evidence. Completion itself never implies post-treatment follow-up; that needs explicit source evidence. Optional fixed-key arrays may be empty. Timeline is input order and only describes its own timepoint. Return strict JSON only.`

export type SummaryInputTimepoint = { id: string; captured_on: string; stage: SummaryMode; confirmed_segments: { content: string; category?: string }[] }
export type SummaryInput = { case_id: string; case_code?: string | null; summary_mode: SummaryMode; timepoints: SummaryInputTimepoint[] }

export function normalizeGeneratedSummary(value: unknown, mode: SummaryMode): CaseSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>, keys = ["case_overview", "treatment_timeline", ...allowedSections[mode]]
  if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record))) return null
  const parsedOverview = factSchema.safeParse(record.case_overview), parsedTimeline = z.array(timelineSchema).safeParse(record.treatment_timeline)
  if (!parsedOverview.success || !parsedTimeline.success) return null
  const sections: CaseSummary["sections"] = []
  for (const key of allowedSections[mode]) { const parsed = z.array(factSchema).safeParse(record[key]); if (!parsed.success) return null; sections.push({ key, items: parsed.data }) }
  return { summary_mode: mode, case_overview: parsedOverview.data, treatment_timeline: parsedTimeline.data, sections_by_key: Object.fromEntries(sections.map((section) => [section.key, section.items])), sections }
}

export function validateCaseSummary(value: unknown, input: SummaryInput) {
  const summary = normalizeGeneratedSummary(value, input.summary_mode)
  if (!summary) return { valid: false, errors: ["schema_invalid"], summary: null }
  const byId = new Map(input.timepoints.map((item) => [item.id, item])), errors: string[] = []
  for (const item of [summary.case_overview, ...summary.treatment_timeline, ...summary.sections.flatMap((section) => section.items)]) for (const id of item.source_timepoint_ids) if (!byId.has(id)) errors.push(`unknown_source:${id}`)
  let previous = ""
  for (const item of summary.treatment_timeline) { const source = byId.get(item.timepoint_id); if (!source || item.captured_on !== source.captured_on || item.stage !== source.stage || !item.source_timepoint_ids.includes(item.timepoint_id)) errors.push(`timeline_provenance:${item.timepoint_id}`); if (previous && item.captured_on < previous) errors.push("timeline_order"); previous = item.captured_on }
  const timelineIds = new Set(summary.treatment_timeline.map((item) => item.timepoint_id))
  if (input.timepoints.some((timepoint) => !timelineIds.has(timepoint.id))) errors.push("timeline_completeness")
  for (const section of summary.sections) for (const item of section.items) { if (section.key === "key_changes" && new Set(item.source_timepoint_ids).size < 2) errors.push("change_requires_two_sources"); if (section.key === "final_outcome" && !item.source_timepoint_ids.some((id) => byId.get(id)?.stage === "completed")) errors.push("final_outcome_requires_completed_source") }
  return { valid: errors.length === 0, errors, summary }
}
