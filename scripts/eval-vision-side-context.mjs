import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

// Isolated diagnostic harness: never writes formal prediction/review/eval/telemetry tables.
const MODEL = "qwen3.7-plus"
const TIMEOUT_MS = 45_000
const SAMPLE_FILE = path.resolve("experiments/vision-side-context.samples.json")
const RESULT_FILE = path.resolve("experiments/vision-side-context-prompt-ablation-results.json")
const selectedPromptVariant = process.argv[2] ?? null
const selectedAttempt = process.argv[3] ? Number(process.argv[3]) : null

const SamplesSchema = z.array(z.object({
  sample_id: z.string().min(1), target_image: z.string().min(1),
  reference_image: z.string().min(1), ground_truth: z.enum(["left", "right"]),
}).strict()).min(1)

const ResultSchema = z.object({
  taxonomy_version: z.literal("side-experiment-v1"),
  view_prediction: z.enum(["left", "right", "unknown"]),
  confidence: z.number().finite().min(0).max(1)
    .refine((value) => Number(value.toFixed(2)) === value),
}).strict()

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "vision_side_experiment_v1", strict: true,
    schema: {
      type: "object", additionalProperties: false,
      properties: {
        taxonomy_version: { type: "string", const: "side-experiment-v1" },
        view_prediction: { type: "string", enum: ["left", "right", "unknown"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["taxonomy_version", "view_prediction", "confidence"],
    },
  },
}

const PROMPTS = {
  "P1-0": "判断这张图片展示的是患者左侧还是右侧。只返回一个分类结果。",
  "P1-1": "判断这张图片展示的是患者左侧还是右侧。只返回一个分类结果。\n\nleft 和 right 指患者自身解剖学上的左侧和右侧，不是图片画面的左边和右边。",
  "P1-2": "判断这张图片展示的是患者左侧还是右侧。只返回一个分类结果。\n\nleft 和 right 指患者自身解剖学上的左侧和右侧，不是图片画面的左边和右边。\n\n如果无法可靠判断，输出 unknown。不要猜测。",
  "P1-3": "判断这张图片展示的是患者左侧还是右侧。只返回一个分类结果。\n\nleft 和 right 指患者自身解剖学上的左侧和右侧，不是图片画面的左边和右边。\n\n如果无法可靠判断，输出 unknown。不要猜测。\n\n可以参考牙齿排列、缺牙、错位和牙齿形态等特征进行判断。",
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function classifyError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes("timeout") || message.includes("timed out") ? "timeout" : "provider_error"
}

async function getSignedUrl(supabase, imagePath) {
  const { data, error } = await supabase.storage.from("case-images").createSignedUrl(imagePath, 300)
  if (error || !data?.signedUrl) throw new Error(`Signed URL failed: ${error?.message ?? "unknown error"}`)
  return data.signedUrl
}

async function runAttempt(openai, promptVariant, prompt, imageUrl, attempt) {
  const startedAt = performance.now()
  const runtime_config = {
    prompt_variant: promptVariant, schema_variant: "S0-like", model: MODEL,
    image_count: 1, enable_thinking: null, timeout_ms: TIMEOUT_MS,
    response_format_type: RESPONSE_FORMAT.type, json_schema_strict: RESPONSE_FORMAT.json_schema.strict,
    schema_type: RESPONSE_FORMAT.json_schema.schema.type,
    additional_properties: RESPONSE_FORMAT.json_schema.schema.additionalProperties,
  }
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: [
          { type: "text", text: "Return only the required JSON object." },
          { type: "image_url", image_url: { url: imageUrl } },
        ] },
      ],
      response_format: RESPONSE_FORMAT,
    })
    const raw = completion.choices[0]?.message.content ?? null
    let parsed = null
    let validation = "not_run"
    let error_type = null
    try {
      parsed = raw === null ? null : JSON.parse(raw)
      const checked = ResultSchema.safeParse(parsed)
      validation = checked.success ? "valid" : "invalid"
      if (!checked.success) error_type = Array.isArray(parsed) ? "schema_violation" : "validation_error"
    } catch {
      validation = "invalid_json"
      error_type = "schema_violation"
    }
    return { attempt, runtime_config, http_status: 200, finish_reason: completion.choices[0]?.finish_reason ?? null, raw_response_content: raw, raw_json_type: parsed === null ? null : Array.isArray(parsed) ? "array" : typeof parsed, parsed_result: parsed, validation, latency_ms: Math.round(performance.now() - startedAt), error_type }
  } catch (error) {
    return { attempt, runtime_config, http_status: error instanceof OpenAI.APIError ? error.status : null, finish_reason: null, raw_response_content: null, raw_json_type: null, parsed_result: null, validation: "not_run", latency_ms: Math.round(performance.now() - startedAt), error_type: classifyError(error), error_message: error instanceof Error ? error.message : String(error) }
  }
}

function counts(attempts) {
  const result = { valid_prediction: 0, schema_violation: 0, validation_error: 0, timeout: 0, provider_error: 0 }
  for (const item of attempts) {
    if (item.validation === "valid") result.valid_prediction += 1
    else if (item.error_type) result[item.error_type] += 1
  }
  return result
}

async function main() {
  const samples = SamplesSchema.parse(JSON.parse(await readFile(SAMPLE_FILE, "utf8")))
  const sample = samples[0]
  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
  const openai = new OpenAI({ apiKey: required("DASHSCOPE_API_KEY"), baseURL: required("DASHSCOPE_BASE_URL"), timeout: TIMEOUT_MS, maxRetries: 0 })
  const targetUrl = await getSignedUrl(supabase, sample.target_image)
  if (selectedPromptVariant && !(selectedPromptVariant in PROMPTS)) {
    throw new Error(`Unknown prompt variant: ${selectedPromptVariant}`)
  }
  if (selectedAttempt !== null && (!Number.isInteger(selectedAttempt) || selectedAttempt < 1 || selectedAttempt > 3)) {
    throw new Error("Attempt must be an integer from 1 to 3")
  }
  const variants = []
  const variantsToRun = selectedPromptVariant
    ? [[selectedPromptVariant, PROMPTS[selectedPromptVariant]]]
    : Object.entries(PROMPTS)
  for (const [promptVariant, prompt] of variantsToRun) {
    let attempts = []
    if (selectedPromptVariant && selectedAttempt !== null) {
      try {
        const prior = JSON.parse(await readFile(RESULT_FILE, "utf8"))
        const priorVariant = prior.variants?.find((variant) => variant.prompt_variant === promptVariant)
        attempts = priorVariant?.attempts?.filter((item) => item.attempt !== selectedAttempt) ?? []
      } catch (error) {
        if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error
      }
    }
    const attemptNumbers = selectedAttempt === null ? [1, 2, 3] : [selectedAttempt]
    for (const attempt of attemptNumbers) {
      console.log(`Running ${promptVariant} attempt ${attempt}/3...`)
      attempts.push(await runAttempt(openai, promptVariant, prompt, targetUrl, attempt))
    }
    attempts.sort((left, right) => left.attempt - right.attempt)
    const error_summary = counts(attempts)
    const array_count = attempts.filter((item) => item.raw_json_type === "array").length
    variants.push({ prompt_variant: promptVariant, prompt, attempts, error_summary, array_count, mean_latency_ms: Math.round(attempts.reduce((total, item) => total + item.latency_ms, 0) / attempts.length) })
    if (!selectedPromptVariant && (array_count > 0 || error_summary.schema_violation > 0)) break
  }
  const output = { experiment: "prompt-ablation", sample_id: sample.sample_id, schema_variant: "S0-like", variants }
  await writeFile(RESULT_FILE, `${JSON.stringify(output, null, 2)}\n`)
  console.table(variants.map((variant) => ({ prompt: variant.prompt_variant, valid_object: variant.error_summary.valid_prediction, array: variant.array_count, error: variant.error_summary.schema_violation + variant.error_summary.validation_error + variant.error_summary.timeout + variant.error_summary.provider_error, mean_latency_ms: variant.mean_latency_ms })))
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
