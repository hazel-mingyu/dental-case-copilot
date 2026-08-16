import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import nextEnv from "@next/env"
import OpenAI from "openai"
import { z } from "zod"
import { applyStructuredCaseGuardrails } from "../lib/voice/structured-case-guardrails.mjs"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
nextEnv.loadEnvConfig(PROJECT_ROOT)
const ROOT = path.join(PROJECT_ROOT, "data/eval/voice_v1/structured_extraction_v1")
const MANIFEST = path.join(ROOT, "structured_eval_manifest.csv")
const CONFIG = {
  v1: { prompt: "voice_case_extraction_prompt_v1.txt", schema: "structured_case_note_schema_v1.json", predictions: "predictions" },
  v2: { prompt: "voice_case_extraction_prompt_v2.txt", schema: "structured_case_note_schema_v2.json", predictions: "predictions_v2" },
  v3: { prompt: "voice_case_extraction_prompt_v3.txt", schema: "structured_case_note_schema_v2.json", predictions: "predictions_v3", rawPredictions: "predictions_v3_raw" },
}
const MODEL = "qwen3.7-plus-2026-05-26"
const NullableText = z.string().nullable()
const Schema = z.object({
  visit_type: NullableText, visit_number: z.number().int().nullable(), treatment_stage: NullableText,
  treatment_actions: z.array(z.object({ action: z.string(), site: NullableText, details: NullableText })),
  observations: z.array(z.object({ item: z.string(), site: NullableText, finding: z.string() })),
  patient_feedback: z.array(z.object({ content: z.string(), current_status: NullableText })),
  follow_up_plan: z.array(z.object({ plan: z.string() })),
  uncertain_items: z.array(z.object({ content: z.string(), reason: z.string() })),
}).strict()
const EMPTY_TEMPLATE = { visit_type: null, visit_number: null, treatment_stage: null, treatment_actions: [], observations: [], patient_feedback: [], follow_up_plan: [], uncertain_items: [] }

function rows(text) { const [header, ...lines] = text.trim().split(/\r?\n/); return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [header.split(",")[index], value]))) }
function csv(value) { const text = value == null ? "" : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text }
function csvText(items, columns) { return `${columns.join(",")}\n${items.map((item) => columns.map((column) => csv(item[column])).join(",")).join("\n")}\n` }
function median(values) { const sorted = [...values].sort((a,b) => a-b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 }

async function validate() {
  const manifest = rows(await readFile(MANIFEST, "utf8"))
  const errors = []
  if (manifest.length !== 10) errors.push(`Expected 10 manifest rows, found ${manifest.length}`)
  for (const item of manifest) {
    try { const baseline = JSON.parse(await readFile(path.resolve(ROOT, item.baseline_prediction_file), "utf8")); if (!baseline.transcript?.trim()) errors.push(`Missing baseline transcript: ${item.case_id}`) } catch { errors.push(`Unreadable baseline prediction: ${item.case_id}`) }
    try { const groundTruth = Schema.parse(JSON.parse(await readFile(path.join(ROOT, item.ground_truth_file), "utf8"))); if (JSON.stringify(groundTruth) === JSON.stringify(EMPTY_TEMPLATE)) errors.push(`Empty ground truth: ${item.case_id}`) } catch { errors.push(`Invalid ground truth: ${item.case_id}`) }
  }
  if (errors.length) throw new Error(`Structured extraction validation failed:\n${errors.join("\n")}`)
  console.log("Baseline transcripts PASS (10/10)")
  console.log("Structured Ground Truth PASS (10/10, schema-valid, non-empty)")
  return manifest
}

function sourcePath(item, experiment) { return experiment === "clean" ? path.join(PROJECT_ROOT, "data/eval/voice_v1/transcripts", `${item.case_id}_ground_truth.txt`) : path.resolve(ROOT, item.baseline_prediction_file) }
async function transcript(item, experiment) { if (experiment === "clean") return (await readFile(sourcePath(item, experiment), "utf8")).trim(); return JSON.parse(await readFile(sourcePath(item, experiment), "utf8")).transcript }
async function run(items, experiment, version) {
  const apiKey = process.env.DASHSCOPE_API_KEY, baseURL = process.env.DASHSCOPE_BASE_URL
  if (!apiKey || !baseURL) throw new Error("Missing DASHSCOPE_API_KEY or DASHSCOPE_BASE_URL")
  const client = new OpenAI({ apiKey, baseURL, timeout: 45_000, maxRetries: 0 })
  const prompt = await readFile(path.join(ROOT, "config", CONFIG[version].prompt), "utf8")
  const jsonSchema = JSON.parse(await readFile(path.join(ROOT, "config", CONFIG[version].schema), "utf8"))
  await mkdir(path.join(ROOT, CONFIG[version].predictions, `${experiment}_transcript`), { recursive: true })
  if (CONFIG[version].rawPredictions) await mkdir(path.join(ROOT, CONFIG[version].rawPredictions, `${experiment}_transcript`), { recursive: true })
  const results = []
  const guardrailEvents = []
  for (const item of items) {
    const input = await transcript(item, experiment)
    const started = performance.now(); let prediction = null, error = "", json_parse_success = false, schema_valid = false
    try { const completion = await client.chat.completions.create({ model: MODEL, messages: [{ role: "system", content: prompt }, { role: "user", content: input }], response_format: { type: "json_schema", json_schema: { name: `structured_case_note_${version}`, strict: true, schema: jsonSchema } } }); prediction = JSON.parse(completion.choices[0]?.message?.content ?? ""); json_parse_success = true; Schema.parse(prediction); if (version === "v3") { await writeFile(path.join(ROOT, CONFIG[version].rawPredictions, `${experiment}_transcript`, `${item.case_id}.json`), `${JSON.stringify(prediction, null, 2)}\n`); const guarded = applyStructuredCaseGuardrails(input, prediction); prediction = guarded.finalStructuredResult; for (const event of guarded.guardrailEvents) guardrailEvents.push({ case_id: item.case_id, experiment, ...event }) } Schema.parse(prediction); schema_valid = true; await writeFile(path.join(ROOT, CONFIG[version].predictions, `${experiment}_transcript`, `${item.case_id}.json`), `${JSON.stringify(prediction, null, 2)}\n`) } catch (cause) { error = cause instanceof Error ? cause.message : String(cause) }
    results.push({ case_id: item.case_id, experiment, version, model: MODEL, response_format: "json_schema_strict", success: schema_valid, latency_ms: Math.round(performance.now() - started), json_parse_success, schema_valid, error })
  }
  const runFile = path.join(ROOT, "review", `structured_extraction_${version}_${experiment}_run.csv`)
  let prior = []
  try { prior = rows(await readFile(runFile, "utf8")) } catch (error) { if (error?.code !== "ENOENT") throw error }
  const merged = new Map(prior.map((result) => [result.case_id, result])); for (const result of results) merged.set(result.case_id, result)
  await writeFile(runFile, csvText([...merged.values()].sort((a, b) => a.case_id.localeCompare(b.case_id)), ["case_id", "experiment", "version", "model", "response_format", "success", "latency_ms", "json_parse_success", "schema_valid", "error"]))
  if (version === "v3") { const eventsFile = path.join(ROOT, "review/structured_guardrail_events_v3.csv"); let previous = []; try { previous = rows(await readFile(eventsFile, "utf8")) } catch (error) { if (error?.code !== "ENOENT") throw error }; const preserved = previous.filter((event) => !(event.experiment === experiment && results.some((result) => result.case_id === event.case_id))); await writeFile(eventsFile, csvText([...preserved, ...guardrailEvents], ["case_id", "experiment", "rule", "before", "after"])) }
  const latency = results.filter((r) => r.success).map((r) => r.latency_ms)
  console.log(JSON.stringify({ experiment, api_success_rate: `${latency.length}/${results.length}`, json_parse_success_rate: `${results.filter((r) => r.json_parse_success).length}/${results.length}`, schema_validity_rate: `${latency.length}/${results.length}`, mean_latency_ms: latency.length ? Math.round(latency.reduce((a,b) => a+b,0)/latency.length) : null, median_latency_ms: latency.length ? median(latency) : null, max_latency_ms: latency.length ? Math.max(...latency) : null }))
}

async function writeReview() {
  const manifest = rows(await readFile(MANIFEST, "utf8")); const review = []
  for (const item of manifest) {
    const groundTruth = JSON.stringify(JSON.parse(await readFile(path.join(ROOT, item.ground_truth_file), "utf8")))
    const prediction = async (experiment) => { try { return JSON.stringify(JSON.parse(await readFile(path.join(ROOT, "predictions", `${experiment}_transcript`, `${item.case_id}.json`), "utf8"))) } catch { return "" } }
    review.push({ case_id: item.case_id, ground_truth_json: groundTruth, clean_prediction_json: await prediction("clean"), asr_prediction_json: await prediction("asr"), visit_info_error: "", treatment_action_error: "", observation_error: "", patient_feedback_error: "", follow_up_error: "", hallucination: "", omission: "", critical_entity_error: "", asr_propagation_error: "", notes: "" })
  }
  await writeFile(path.join(ROOT, "review/structured_extraction_review.csv"), csvText(review, ["case_id", "ground_truth_json", "clean_prediction_json", "asr_prediction_json", "visit_info_error", "treatment_action_error", "observation_error", "patient_feedback_error", "follow_up_error", "hallucination", "omission", "critical_entity_error", "asr_propagation_error", "notes"]))
}

async function main() {
  const args = process.argv.slice(2); const caseIndex = args.indexOf("--case"); const experimentIndex = args.indexOf("--experiment"); const versionIndex = args.indexOf("--version"); const selected = caseIndex === -1 ? null : args[caseIndex + 1]; const experiment = experimentIndex === -1 ? null : args[experimentIndex + 1]; const version = versionIndex === -1 ? "v1" : args[versionIndex + 1]
  if (!args.includes("--validate") && !args.includes("--all") && !args.includes("--write-review") && !selected) throw new Error("Use --validate, --case case_01, --all, or --write-review")
  if (experiment && !["clean", "asr"].includes(experiment)) throw new Error("Use --experiment clean or --experiment asr")
  if (!(version in CONFIG)) throw new Error("Use --version v1, --version v2, or --version v3")
  const manifest = await validate(); if (args.includes("--validate")) return
  if (args.includes("--write-review")) return writeReview()
  const items = args.includes("--all") ? manifest : manifest.filter((item) => item.case_id === selected)
  if (!items.length) throw new Error("Unknown case")
  const experiments = experiment ? [experiment] : ["clean", "asr"]
  for (const name of experiments) await run(items, name, version)
  if (args.includes("--all") && !experiment) await writeReview()
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
