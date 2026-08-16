import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

const MODEL = "qwen3.7-plus"
const PREDICTOR_VERSION = "vision-v2"
const TAXONOMY_VERSION = "dental-photo-view-v1"
const TIMEOUT_MS = 45_000
const SET_FILE = path.resolve("experiments/vision-v2-regression-set.json")
const RESULT_FILE = path.resolve("experiments/vision-v2-regression-results.json")
const labels = ["intraoral_frontal", "intraoral_right_buccal", "intraoral_left_buccal", "intraoral_maxillary_occlusal", "intraoral_mandibular_occlusal", "extraoral_frontal_relaxed", "extraoral_frontal_smile", "extraoral_right_profile", "extraoral_left_profile", "other", "unknown"]
const prompt = `You are a strict image-view classifier for orthodontic and dental clinical photographs. Your only task is to classify exactly one input image using the taxonomy "dental-photo-view-v1". Do not diagnose conditions, identify diseases, recommend treatment, infer patient identity, or describe clinical findings. Use the patient's anatomical left/right, not the viewer's screen left/right. Allowed labels: ${labels.join(", ")}. Return unknown rather than guessing whenever a specific taxonomy class is not reliable. If the image is an intraoral side-buccal view but the patient's anatomical left/right cannot be reliably determined from this image alone, return unknown. Do not infer anatomical left/right from the image's screen-left/screen-right orientation. Do not guess. Return other only when the image is sufficiently clear and visibly does not fit any standard taxonomy label. Confidence is your self-assessed confidence in the final output. For unknown, it is confidence that abstention is appropriate. Return exactly one JSON object with exactly these three required fields: taxonomy_version, view_prediction, confidence. Do not add any other field or text.`
const response_format = { type: "json_schema", json_schema: { name: "vision_classification_v2", strict: true, schema: { type: "object", additionalProperties: false, properties: { taxonomy_version: { type: "string", const: TAXONOMY_VERSION }, view_prediction: { type: "string", enum: labels }, confidence: { type: "number", minimum: 0, maximum: 1 } }, required: ["taxonomy_version", "view_prediction", "confidence"] } } }

function required(name) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value }
function valid(output) { return output && typeof output === "object" && !Array.isArray(output) && output.taxonomy_version === TAXONOMY_VERSION && labels.includes(output.view_prediction) && typeof output.confidence === "number" && output.confidence >= 0 && output.confidence <= 1 && Number(output.confidence.toFixed(2)) === output.confidence && Object.keys(output).length === 3 }
function median(values) { const sorted = [...values].sort((a,b)=>a-b); return sorted.length % 2 ? sorted[(sorted.length-1)/2] : (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2 }

async function main() {
  const set = JSON.parse(await readFile(SET_FILE, "utf8"))
  if (set.length !== 10) throw new Error("Regression set must contain exactly 10 images")
  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
  const openai = new OpenAI({ apiKey: required("DASHSCOPE_API_KEY"), baseURL: required("DASHSCOPE_BASE_URL"), timeout: TIMEOUT_MS, maxRetries: 0 })
  const imageIds = set.map((sample) => sample.image_id)
  const { data: images, error: imageError } = await supabase.from("case_images").select("id,image_path").in("id", imageIds)
  if (imageError || images?.length !== 10) throw new Error(`Could not load regression images: ${imageError?.message ?? "missing image"}`)
  const imageById = new Map(images.map((image) => [image.id, image]))
  const { data: v1, error: v1Error } = await supabase.from("image_predictions").select("id,image_id,view_prediction,confidence").in("image_id", imageIds).eq("predictor_version", "vision-v1").eq("taxonomy_version", TAXONOMY_VERSION)
  if (v1Error || v1?.length !== 10) throw new Error(`Could not load v1 baseline: ${v1Error?.message ?? "missing prediction"}`)
  const v1ByImage = new Map(v1.map((prediction) => [prediction.image_id, prediction]))
  const { data: existing, error: existingError } = await supabase.from("image_predictions").select("id,image_id,view_prediction,confidence").in("image_id", imageIds).eq("predictor_version", PREDICTOR_VERSION).eq("taxonomy_version", TAXONOMY_VERSION)
  if (existingError) throw existingError
  const v2ByImage = new Map(existing.map((prediction) => [prediction.image_id, prediction]))
  const rows = []
  for (const sample of set) {
    const image = imageById.get(sample.image_id); let prediction = v2ByImage.get(sample.image_id); let latency_ms = null; let error_type = null
    if (!prediction) {
      const { data: signed, error: signedError } = await supabase.storage.from("case-images").createSignedUrl(image.image_path, 300)
      if (signedError || !signed?.signedUrl) { rows.push({ ...sample, v1: v1ByImage.get(sample.image_id), v2: null, latency_ms, error_type: "storage_url_failed" }); continue }
      const started = performance.now()
      try {
        const completion = await openai.chat.completions.create({ model: MODEL, messages: [{ role: "system", content: prompt }, { role: "user", content: [{ type: "text", text: "Classify this single image and return the required JSON object." }, { type: "image_url", image_url: { url: signed.signedUrl } }] }], response_format })
        latency_ms = Math.round(performance.now() - started)
        const output = JSON.parse(completion.choices[0]?.message.content ?? "")
        if (!valid(output)) throw new Error("validation_error")
        const { data, error } = await supabase.from("image_predictions").insert({ image_id: sample.image_id, ...output, predictor_version: PREDICTOR_VERSION }).select("id,image_id,view_prediction,confidence").single()
        if (error) throw error
        prediction = data
      } catch (error) { latency_ms = latency_ms ?? Math.round(performance.now() - started); error_type = error instanceof Error && error.message.includes("timeout") ? "timeout" : "prediction_or_provider_error" }
    }
    rows.push({ ...sample, v1: v1ByImage.get(sample.image_id), v2: prediction ?? null, latency_ms, error_type })
    await writeFile(RESULT_FILE, `${JSON.stringify({ regression_set: "vision-v1-baseline-10", model: MODEL, predictor_version: PREDICTOR_VERSION, thinking: "unchanged", rows }, null, 2)}\n`)
  }
  const complete = rows.filter((row) => row.v2)
  const summarize = (version) => { const predictions = rows.map((row) => row[version]); return { correct: predictions.filter((prediction, index) => prediction?.view_prediction === rows[index].ground_truth).length, misclassification: predictions.filter((prediction, index) => prediction && prediction.view_prediction !== "unknown" && prediction.view_prediction !== rows[index].ground_truth).length, unknown: predictions.filter((prediction) => prediction?.view_prediction === "unknown").length } }
  const latencies = rows.map((row) => row.latency_ms).filter((value) => typeof value === "number")
  const sideRows = rows.filter((row) => row.ground_truth === "intraoral_left_buccal" || row.ground_truth === "intraoral_right_buccal")
  const output = { regression_set: "vision-v1-baseline-10", model: MODEL, predictor_version: PREDICTOR_VERSION, thinking: "unchanged", rows, summary: { v1: summarize("v1"), v2: summarize("v2"), side_badcases: sideRows.map((row) => ({ image_id: row.image_id, ground_truth: row.ground_truth, v1: row.v1?.view_prediction, v2: row.v2?.view_prediction })), v2_latency_ms: latencies.length ? { mean: Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length), median: median(latencies), min: Math.min(...latencies), max: Math.max(...latencies) } : null, completed: `${complete.length}/10` } }
  await writeFile(RESULT_FILE, `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify(output.summary, null, 2))
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
