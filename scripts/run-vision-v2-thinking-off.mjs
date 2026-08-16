import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"

// Offline controlled experiment. It never inserts or updates product tables.
const MODEL = "qwen3.7-plus"
const PREDICTOR_VERSION = "vision-v2"
const TAXONOMY_VERSION = "dental-photo-view-v1"
const TIMEOUT_MS = 45_000
const ENABLE_THINKING = false
const SET_FILE = path.resolve("experiments/vision-v2-regression-set.json")
const RESULT_FILE = path.resolve("experiments/vision-v2-thinking-off-results.json")
const SAMPLE_ID = process.argv.find((argument) => argument.startsWith("--sample="))?.slice("--sample=".length) ?? null
const MERGE_ONLY = process.argv.includes("--merge")
const labels = [
  "intraoral_frontal", "intraoral_right_buccal", "intraoral_left_buccal",
  "intraoral_maxillary_occlusal", "intraoral_mandibular_occlusal",
  "extraoral_frontal_relaxed", "extraoral_frontal_smile", "extraoral_right_profile",
  "extraoral_left_profile", "other", "unknown",
]

// Frozen formal vision-v2 Prompt and JSON Schema. The sole experiment variable is enable_thinking.
const prompt = `You are a strict image-view classifier for orthodontic and dental clinical photographs.

Your only task is to classify exactly one input image using the taxonomy "dental-photo-view-v1". Do not diagnose conditions, identify diseases, recommend treatment, infer patient identity, or describe clinical findings.

Use the patient's anatomical left/right, not the viewer's screen left/right.

Allowed labels: ${labels.join(", ")}.

Decision rules:
1. Return unknown rather than guessing whenever a specific taxonomy class is not reliable.
2. If the image is an intraoral side-buccal view but the patient's anatomical left/right cannot be reliably determined from this image alone, return unknown. Do not infer anatomical left/right from the image's screen-left/screen-right orientation. Do not guess.
3. Return other only when the image is sufficiently clear and visibly does not fit any standard taxonomy label.
4. Confidence is your self-assessed confidence in the final output. For unknown, it is confidence that abstention is appropriate.
5. Return exactly one JSON object with exactly these three required fields: taxonomy_version, view_prediction, confidence. Do not add any other field or text.`

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "vision_classification_v2",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        taxonomy_version: { type: "string", const: TAXONOMY_VERSION },
        view_prediction: { type: "string", enum: labels },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["taxonomy_version", "view_prediction", "confidence"],
    },
  },
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function valid(output) {
  return output && typeof output === "object" && !Array.isArray(output) &&
    output.taxonomy_version === TAXONOMY_VERSION && labels.includes(output.view_prediction) &&
    typeof output.confidence === "number" && output.confidence >= 0 && output.confidence <= 1 &&
    Number(output.confidence.toFixed(2)) === output.confidence && Object.keys(output).length === 3
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function classifyError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes("timeout") || message.includes("timed out") ? "timeout" : "provider_error"
}

function summarize(rows) {
  const successful = rows.filter((row) => row.success)
  const validPredictions = successful.filter((row) => row.prediction)
  const correct = validPredictions.filter((row) => row.prediction.view_prediction === row.ground_truth).length
  const unknown = validPredictions.filter((row) => row.prediction.view_prediction === "unknown").length
  const nonUnknown = validPredictions.filter((row) => row.prediction.view_prediction !== "unknown")
  const misclassification = nonUnknown.filter((row) => row.prediction.view_prediction !== row.ground_truth).length
  const successfulLatencies = successful.map((row) => row.latency_ms)
  const latencyBuckets = {
    "<=8s": successfulLatencies.filter((value) => value <= 8_000).length,
    "<=10s": successfulLatencies.filter((value) => value <= 10_000).length,
    ">10s": successfulLatencies.filter((value) => value > 10_000).length,
  }

  return {
    reliability: {
      success_count: successful.length,
      success_rate: `${successful.length}/${rows.length}`,
      timeout_count: rows.filter((row) => row.error_type === "timeout").length,
      provider_error_count: rows.filter((row) => row.error_type === "provider_error").length,
      schema_violation_count: rows.filter((row) => row.error_type === "schema_violation").length,
      validation_error_count: rows.filter((row) => row.error_type === "validation_error").length,
    },
    quality: {
      valid_prediction_count: validPredictions.length,
      accuracy: `${correct}/${validPredictions.length}`,
      correct,
      misclassification,
      unknown,
      abstention_rate: validPredictions.length ? unknown / validPredictions.length : null,
      coverage: validPredictions.length ? nonUnknown.length / validPredictions.length : null,
      selective_accuracy: nonUnknown.length ? correct / nonUnknown.length : null,
    },
    successful_latency_ms: successfulLatencies.length ? {
      mean: Math.round(successfulLatencies.reduce((sum, value) => sum + value, 0) / successfulLatencies.length),
      median: median(successfulLatencies),
      min: Math.min(...successfulLatencies),
      max: Math.max(...successfulLatencies),
      buckets: latencyBuckets,
    } : null,
  }
}

async function main() {
  const set = JSON.parse(await readFile(SET_FILE, "utf8"))
  if (set.length !== 10) throw new Error("Regression set must contain exactly 10 images")
  if (SAMPLE_ID && !set.some((sample) => sample.image_id === SAMPLE_ID)) {
    throw new Error("Sample is not in the frozen 10-image regression set")
  }

  if (MERGE_ONLY) {
    const rows = []
    for (const sample of set) {
      const progressFile = path.resolve(`experiments/vision-v2-thinking-off-${sample.image_id}.json`)
      const progress = JSON.parse(await readFile(progressFile, "utf8"))
      rows.push(progress.rows[0])
    }
    const output = {
      experiment: "vision-v2-thinking-off",
      formal_workflow_unchanged: true,
      configuration: { model: MODEL, predictor_version: PREDICTOR_VERSION, taxonomy_version: TAXONOMY_VERSION, enable_thinking: ENABLE_THINKING, timeout_ms: TIMEOUT_MS, sample_count: set.length },
      rows,
      summary: summarize(rows),
      side_badcases: rows.filter((row) => row.ground_truth === "intraoral_left_buccal" || row.ground_truth === "intraoral_right_buccal"),
    }
    await writeFile(RESULT_FILE, `${JSON.stringify(output, null, 2)}\n`)
    console.log(JSON.stringify(output.summary, null, 2))
    return
  }

  let previousRows = []
  try {
    if (SAMPLE_ID) {
      previousRows = JSON.parse(await readFile(path.resolve(`experiments/vision-v2-thinking-off-${SAMPLE_ID}.json`), "utf8")).rows ?? []
    }
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error
  }
  const previousByImage = new Map(previousRows.map((row) => [row.image_id, row]))

  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
  const openai = new OpenAI({
    apiKey: required("DASHSCOPE_API_KEY"),
    baseURL: required("DASHSCOPE_BASE_URL"),
    timeout: TIMEOUT_MS,
    maxRetries: 0,
  })
  const imageIds = set.map((sample) => sample.image_id)
  const { data: images, error: imagesError } = await supabase
    .from("case_images")
    .select("id,image_path")
    .in("id", imageIds)
  if (imagesError || images?.length !== 10) throw new Error(`Could not load regression images: ${imagesError?.message ?? "missing image"}`)
  const imageById = new Map(images.map((image) => [image.id, image]))

  const { data: v2Baseline, error: baselineError } = await supabase
    .from("image_predictions")
    .select("id,image_id,view_prediction,confidence")
    .in("image_id", imageIds)
    .eq("predictor_version", PREDICTOR_VERSION)
    .eq("taxonomy_version", TAXONOMY_VERSION)
  if (baselineError || v2Baseline?.length !== 10) throw new Error(`Could not load frozen v2 baseline: ${baselineError?.message ?? "missing prediction"}`)
  const baselineByImage = new Map(v2Baseline.map((prediction) => [prediction.image_id, prediction]))

  const rows = []
  for (const sample of SAMPLE_ID ? set.filter((item) => item.image_id === SAMPLE_ID) : set) {
    const previous = previousByImage.get(sample.image_id)
    if (previous) {
      rows.push(previous)
      console.log(JSON.stringify({ image_id: previous.image_id, resumed: true, success: previous.success, prediction: previous.prediction?.view_prediction ?? null, latency_ms: previous.latency_ms, error_type: previous.error_type, runtime_enable_thinking: previous.runtime_config.enable_thinking }))
      continue
    }
    const image = imageById.get(sample.image_id)
    const started_at = new Date().toISOString()
    const started = performance.now()
    const runtime_config = {
      model: MODEL,
      predictor_version: PREDICTOR_VERSION,
      taxonomy_version: TAXONOMY_VERSION,
      image_count: 1,
      enable_thinking: ENABLE_THINKING,
      timeout_ms: TIMEOUT_MS,
      response_format_type: responseFormat.type,
      json_schema_strict: responseFormat.json_schema.strict,
      schema_type: responseFormat.json_schema.schema.type,
    }
    let row

    try {
      const { data: signed, error: signedError } = await supabase.storage
        .from("case-images")
        .createSignedUrl(image.image_path, 300)
      if (signedError || !signed?.signedUrl) throw new Error(`storage_url_failed: ${signedError?.message ?? "unknown"}`)

      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: [
            { type: "text", text: "Classify this single image and return the required JSON object." },
            { type: "image_url", image_url: { url: signed.signedUrl } },
          ] },
        ],
        response_format: responseFormat,
        extra_body: { enable_thinking: false },
      })
      const raw_response = completion.choices[0]?.message.content ?? null
      let output = null
      let raw_response_type = null
      try {
        output = raw_response === null ? null : JSON.parse(raw_response)
        raw_response_type = output === null ? null : Array.isArray(output) ? "array" : typeof output
      } catch {
        raw_response_type = "invalid_json"
      }
      const validation = valid(output) ? "valid" : "invalid"
      const success = validation === "valid"
      row = {
        image_id: sample.image_id,
        ground_truth: sample.ground_truth,
        vision_v2_thinking_null: baselineByImage.get(sample.image_id),
        prediction: success ? output : null,
        confidence: success ? output.confidence : null,
        success,
        error_type: success ? null : raw_response_type === "array" || raw_response_type === "invalid_json" ? "schema_violation" : "validation_error",
        latency_ms: Math.round(performance.now() - started),
        started_at,
        finished_at: new Date().toISOString(),
        runtime_config,
        http_status: 200,
        finish_reason: completion.choices[0]?.finish_reason ?? null,
        raw_response_type,
        validation,
        raw_response,
      }
    } catch (error) {
      const error_type = error instanceof Error && error.message.startsWith("storage_url_failed") ? "provider_error" : classifyError(error)
      row = {
        image_id: sample.image_id,
        ground_truth: sample.ground_truth,
        vision_v2_thinking_null: baselineByImage.get(sample.image_id),
        prediction: null,
        confidence: null,
        success: false,
        error_type,
        latency_ms: Math.round(performance.now() - started),
        started_at,
        finished_at: new Date().toISOString(),
        runtime_config,
        http_status: error instanceof OpenAI.APIError ? error.status : null,
        finish_reason: null,
        raw_response_type: null,
        validation: "not_run",
        raw_response: null,
      }
    }
    rows.push(row)
    const progressFile = SAMPLE_ID
      ? path.resolve(`experiments/vision-v2-thinking-off-${SAMPLE_ID}.json`)
      : RESULT_FILE
    await writeFile(progressFile, `${JSON.stringify({ experiment: "vision-v2-thinking-off", rows, summary: summarize(rows) }, null, 2)}\n`)
    console.log(JSON.stringify({ image_id: row.image_id, success: row.success, prediction: row.prediction?.view_prediction ?? null, latency_ms: row.latency_ms, error_type: row.error_type, runtime_enable_thinking: row.runtime_config.enable_thinking }))
  }

  const output = {
    experiment: "vision-v2-thinking-off",
    formal_workflow_unchanged: true,
    configuration: { model: MODEL, predictor_version: PREDICTOR_VERSION, taxonomy_version: TAXONOMY_VERSION, enable_thinking: ENABLE_THINKING, timeout_ms: TIMEOUT_MS, sample_count: set.length },
    rows,
    summary: summarize(rows),
    side_badcases: rows.filter((row) => row.ground_truth === "intraoral_left_buccal" || row.ground_truth === "intraoral_right_buccal"),
  }
  if (!SAMPLE_ID) await writeFile(RESULT_FILE, `${JSON.stringify(output, null, 2)}\n`)
  console.log(JSON.stringify(output.summary, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
