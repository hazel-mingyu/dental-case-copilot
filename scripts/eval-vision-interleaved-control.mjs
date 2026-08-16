import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

// Isolated stability experiment; never writes formal product tables.
const MODEL = "qwen3.7-plus"
const TIMEOUT_MS = 45_000
const SAMPLE_FILE = path.resolve("experiments/vision-side-context.samples.json")
const thinkingMode = process.argv.includes("--thinking-off") ? "off" : "default"
const RESULT_FILE = path.resolve(
  thinkingMode === "off"
    ? "experiments/vision-interleaved-control-thinking-off-results.json"
    : "experiments/vision-interleaved-control-results.json"
)
const variant = process.argv[2]
const attempt = Number(process.argv[3])

if (!["D0", "P1-0"].includes(variant) || !Number.isInteger(attempt) || attempt < 1 || attempt > 5) {
  throw new Error("Usage: npm.cmd run experiment:vision-interleaved-control -- D0|P1-0 1..5 [--thinking-off]")
}

const frozenLabels = ["intraoral_frontal", "intraoral_right_buccal", "intraoral_left_buccal", "intraoral_maxillary_occlusal", "intraoral_mandibular_occlusal", "extraoral_frontal_relaxed", "extraoral_frontal_smile", "extraoral_right_profile", "extraoral_left_profile", "other", "unknown"]
const D0Schema = z.object({ taxonomy_version: z.literal("dental-photo-view-v1"), view_prediction: z.enum(frozenLabels), confidence: z.number().finite().min(0).max(1).refine((v) => Number(v.toFixed(2)) === v) }).strict()
const SideSchema = z.object({ taxonomy_version: z.literal("side-experiment-v1"), view_prediction: z.enum(["left", "right", "unknown"]), confidence: z.number().finite().min(0).max(1).refine((v) => Number(v.toFixed(2)) === v) }).strict()
const d0Prompt = `You are a strict image-view classifier for orthodontic and dental clinical photographs. Your only task is to classify exactly one input image using the taxonomy "dental-photo-view-v1". Do not diagnose conditions, identify diseases, recommend treatment, infer patient identity, or describe clinical findings. Use the patient's anatomical left/right, not the viewer's screen left/right. Allowed labels: intraoral_frontal, intraoral_right_buccal, intraoral_left_buccal, intraoral_maxillary_occlusal, intraoral_mandibular_occlusal, extraoral_frontal_relaxed, extraoral_frontal_smile, extraoral_right_profile, extraoral_left_profile, other, unknown. Return unknown rather than guessing whenever a specific taxonomy class is not reliable. Return exactly one JSON object with exactly these three required fields: taxonomy_version, view_prediction, confidence. taxonomy_version must be "dental-photo-view-v1". Do not add any other field.`
const p10Prompt = "判断这张图片展示的是患者左侧还是右侧。只返回一个分类结果。"

function required(name) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value }
function format(name, schema) { return { type: "json_schema", json_schema: { name, strict: true, schema } } }
function errorType(error) { const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase(); return message.includes("timeout") || message.includes("timed out") ? "timeout" : "provider_error" }
function stats(records) {
  const successes = records.filter((record) => record.success)
  const latencies = successes.map((record) => record.latency_ms).sort((a, b) => a - b)
  const median = latencies.length === 0 ? null : latencies.length % 2 ? latencies[(latencies.length - 1) / 2] : (latencies[latencies.length / 2 - 1] + latencies[latencies.length / 2]) / 2
  return { success_count: successes.length, timeout_count: records.filter((record) => record.error_type === "timeout").length, success_rate: `${successes.length}/${records.length}`, successful_latency_ms: { min: latencies[0] ?? null, max: latencies.at(-1) ?? null, median, mean: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null } }
}

async function main() {
  const samples = JSON.parse(await readFile(SAMPLE_FILE, "utf8"))
  const sample = samples[0]
  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
  const { data: signed, error: signedError } = await supabase.storage.from("case-images").createSignedUrl(sample.target_image, 300)
  if (signedError || !signed?.signedUrl) throw new Error(`Signed URL failed: ${signedError?.message ?? "unknown"}`)
  const isD0 = variant === "D0"
  const config = isD0 ? {
    prompt: d0Prompt, schema: D0Schema, responseFormat: format("vision_classification_v1", { type: "object", additionalProperties: false, properties: { taxonomy_version: { type: "string", const: "dental-photo-view-v1" }, view_prediction: { type: "string", enum: frozenLabels }, confidence: { type: "number", minimum: 0, maximum: 1 } }, required: ["taxonomy_version", "view_prediction", "confidence"] }),
  } : {
    prompt: p10Prompt, schema: SideSchema, responseFormat: format("vision_side_experiment_v1", { type: "object", additionalProperties: false, properties: { taxonomy_version: { type: "string", const: "side-experiment-v1" }, view_prediction: { type: "string", enum: ["left", "right", "unknown"] }, confidence: { type: "number", minimum: 0, maximum: 1 } }, required: ["taxonomy_version", "view_prediction", "confidence"] }),
  }
  const openai = new OpenAI({ apiKey: required("DASHSCOPE_API_KEY"), baseURL: required("DASHSCOPE_BASE_URL"), timeout: TIMEOUT_MS, maxRetries: 0 })
  const started_at = new Date().toISOString(); const started = performance.now()
  const runtime_config = { model: MODEL, sample_id: sample.sample_id, image_count: 1, enable_thinking: thinkingMode === "off" ? false : null, timeout_ms: TIMEOUT_MS, response_format_type: config.responseFormat.type, json_schema_strict: config.responseFormat.json_schema.strict, schema_type: config.responseFormat.json_schema.schema.type }
  let record
  try {
    const completion = await openai.chat.completions.create({ model: MODEL, messages: [{ role: "system", content: config.prompt }, { role: "user", content: [{ type: "text", text: "Return only the required JSON object." }, { type: "image_url", image_url: { url: signed.signedUrl } }] }], response_format: config.responseFormat, ...(thinkingMode === "off" ? { extra_body: { enable_thinking: false } } : {}) })
    const raw = completion.choices[0]?.message.content ?? null; let parsed = null; let validation = "not_run"; let type = null
    try { parsed = raw === null ? null : JSON.parse(raw); type = parsed === null ? null : Array.isArray(parsed) ? "array" : typeof parsed; validation = config.schema.safeParse(parsed).success ? "valid" : "invalid" } catch { validation = "invalid_json"; type = null }
    const success = validation === "valid"
    record = { order: isD0 ? attempt * 2 - 1 : attempt * 2, variant, attempt, started_at, finished_at: new Date().toISOString(), runtime_config, http_status: 200, finish_reason: completion.choices[0]?.finish_reason ?? null, raw_response_type: type, validation, latency_ms: Math.round(performance.now() - started), success, error_type: success ? null : type === "array" || validation === "invalid_json" ? "schema_violation" : "validation_error" }
  } catch (error) { record = { order: isD0 ? attempt * 2 - 1 : attempt * 2, variant, attempt, started_at, finished_at: new Date().toISOString(), runtime_config, http_status: error instanceof OpenAI.APIError ? error.status : null, finish_reason: null, raw_response_type: null, validation: "not_run", latency_ms: Math.round(performance.now() - started), success: false, error_type: errorType(error) } }
  let records = []; try { records = JSON.parse(await readFile(RESULT_FILE, "utf8")).records ?? [] } catch (error) { if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error }
  records = [...records.filter((item) => !(item.variant === variant && item.attempt === attempt)), record].sort((a, b) => a.order - b.order)
  await writeFile(RESULT_FILE, `${JSON.stringify({ experiment: "interleaved-control", thinking_mode: thinkingMode, records, summary: { D0: stats(records.filter((r) => r.variant === "D0")), "P1-0": stats(records.filter((r) => r.variant === "P1-0")) } }, null, 2)}\n`)
  console.log(JSON.stringify(record, null, 2))
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
