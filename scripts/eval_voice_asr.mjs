import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"
import path from "node:path"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { loadEnvConfig } = nextEnv
loadEnvConfig(PROJECT_ROOT)

const ROOT = path.join(PROJECT_ROOT, "data/eval/voice_v1")
const MANIFEST = path.join(ROOT, "voice_eval_manifest.csv")
const RESULTS = path.join(ROOT, "results/aliyun")
const HOTWORD_CONFIG = path.join(ROOT, "config/orthodontic_hotwords_v1.csv")
const MODEL = "qwen-audio-3.0-asr-flash"
const MODES = ["baseline", "hotword"]
const HOTWORD_WEIGHT = 5

function csvRows(text) {
  const lines = text.trim().split(/\r?\n/)
  const header = lines.shift().split(",")
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [header[index], value])))
}

async function hotwords() {
  let rows
  try {
    rows = csvRows(await readFile(HOTWORD_CONFIG, "utf8"))
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") throw new Error("orthodontic_hotwords_v1.csv not found")
    throw error
  }
  const terms = rows.map((row) => row.term?.trim()).filter(Boolean)
  if (!terms.length) throw new Error("orthodontic_hotwords_v1.csv contains no terms")
  return terms
}

function csvValue(value) {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toCsv(rows, columns) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvValue(row[column])).join(",")).join("\n")}\n`
}

function normalize(text) {
  return text.replace(/[\p{P}\s]/gu, "").toLowerCase()
}

function characterErrors(reference, hypothesis) {
  const rows = reference.length + 1
  const columns = hypothesis.length + 1
  const table = Array.from({ length: rows }, (_, row) => {
    const line = Array(columns)
    line[0] = row
    return line
  })
  for (let column = 0; column < columns; column += 1) table[0][column] = column
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      table[row][column] = reference[row - 1] === hypothesis[column - 1]
        ? table[row - 1][column - 1]
        : 1 + Math.min(table[row - 1][column - 1], table[row - 1][column], table[row][column - 1])
    }
  }
  return table[rows - 1][columns - 1]
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function validateDataset() {
  const manifest = csvRows(await readFile(MANIFEST, "utf8"))
  const expected = Array.from({ length: 10 }, (_, index) => `case_${String(index + 1).padStart(2, "0")}`)
  const audio = await readdir(path.join(ROOT, "audio"))
  const transcripts = await readdir(path.join(ROOT, "transcripts"))
  const audioIds = audio.filter((file) => /\.m4a$/i.test(file)).map((file) => file.match(/case_\d{2}/i)?.[0]?.toLowerCase())
  const transcriptIds = transcripts.filter((file) => /\.txt$/i.test(file)).map((file) => file.match(/case_\d{2}/i)?.[0]?.toLowerCase())
  const problems = []
  if (audioIds.length !== 10) problems.push(`Expected 10 audio files, found ${audioIds.length}`)
  if (transcriptIds.length !== 10) problems.push(`Expected 10 ground-truth files, found ${transcriptIds.length}`)
  if (manifest.length !== 10) problems.push(`Expected 10 manifest rows, found ${manifest.length}`)
  for (const caseId of expected) {
    if (!audioIds.includes(caseId)) problems.push(`Missing audio for ${caseId}`)
    if (!transcriptIds.includes(caseId)) problems.push(`Missing ground truth for ${caseId}`)
    const item = manifest.find((row) => row.case_id === caseId)
    if (!item) problems.push(`Missing manifest row for ${caseId}`)
    for (const relativePath of item ? [item.audio_file, item.ground_truth_file] : []) {
      const file = path.join(ROOT, relativePath)
      if (!(await stat(file)).size) problems.push(`Empty file: ${relativePath}`)
    }
  }
  if (problems.length) throw new Error(`Dataset validation failed:\n${problems.join("\n")}`)
  console.log("Dataset scan PASS (10 audio, 10 ground truth, case_01–case_10 matched, no empty files)")
  console.log("Manifest PASS")
  return manifest
}

function credentials() {
  const apiKey = process.env.DASHSCOPE_API_KEY
  const baseUrl = process.env.DASHSCOPE_BASE_URL
  const missing = []
  if (!apiKey) missing.push("DASHSCOPE_API_KEY")
  if (!baseUrl) missing.push("DASHSCOPE_BASE_URL")
  if (missing.length) {
    for (const name of missing) console.error(`Missing ${name}`)
    process.exitCode = 0
    return null
  }
  console.log("DASHSCOPE_API_KEY: loaded")
  console.log("DASHSCOPE_BASE_URL: loaded")
  const url = new URL(baseUrl)
  return {
    apiKey,
    nativeEndpoint: new URL("/api/v1/services/aigc/multimodal-generation/generation", url.origin),
  }
}

async function transcribe(audioPath, mode, credential, configuredHotwords) {
  const audio = await readFile(audioPath)
  const data = `data:audio/mp4;base64,${audio.toString("base64")}`
  const parameters = { format: "m4a" }
  if (mode === "hotword") parameters.vocabulary = Object.fromEntries(configuredHotwords.map((text) => [text, HOTWORD_WEIGHT]))
  const started = performance.now()
  try {
    const response = await fetch(credential.nativeEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json", "X-DashScope-SSE": "disable" },
      body: JSON.stringify({ model: MODEL, input: { messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data } }] }] }, parameters }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(body?.error?.message ?? body?.message ?? `HTTP ${response.status}`)
      error.httpStatus = response.status
      error.code = body?.error?.code ?? body?.code ?? "unknown"
      throw error
    }
    const transcript = body?.output?.output?.sentence?.text ?? body?.output?.text
    if (typeof transcript !== "string") throw new Error("Provider response did not include transcript text")
    return { transcript, latency_ms: Math.round(performance.now() - started), success: true, error: "", http_status: response.status, error_code: "" }
  } catch (error) {
    const cause = error?.cause
    const errorDetail = [
      error instanceof Error ? error.message : String(error),
      cause?.code ? `cause.code=${cause.code}` : "",
      cause?.message ? `cause.message=${cause.message}` : "",
      `origin=${credential.nativeEndpoint.origin}`,
      `pathname=${credential.nativeEndpoint.pathname}`,
    ].filter(Boolean).join("; ")
    return { transcript: "", latency_ms: Math.round(performance.now() - started), success: false, error: errorDetail, http_status: error?.httpStatus ?? "", error_code: error?.code ?? cause?.code ?? "network_error" }
  }
}

async function runMode(mode, manifest, credential, configuredHotwords = []) {
  const rows = []
  const directory = path.join(RESULTS, mode)
  await mkdir(directory, { recursive: true })
  for (const item of manifest) {
    console.log(`${mode}: ${item.case_id}`)
    const groundTruth = await readFile(path.join(ROOT, item.ground_truth_file), "utf8")
    const response = await transcribe(path.join(ROOT, item.audio_file), mode, credential, configuredHotwords)
    const normalizedGroundTruth = normalize(groundTruth)
    const normalizedPrediction = normalize(response.transcript)
    const cer = response.success ? characterErrors(normalizedGroundTruth, normalizedPrediction) / normalizedGroundTruth.length : null
    const row = { case_id: item.case_id, provider: "aliyun", model: MODEL, mode, transcript: response.transcript, latency_ms: response.latency_ms, success: response.success, error: response.error, http_status: response.http_status, error_code: response.error_code, ground_truth: groundTruth.trim(), cer, exact_match: response.success && normalizedGroundTruth === normalizedPrediction }
    rows.push(row)
    await writeFile(path.join(directory, `${item.case_id}.json`), `${JSON.stringify(row, null, 2)}\n`)
  }
  await writeFile(path.join(directory, "asr_results.csv"), toCsv(rows, ["case_id", "provider", "model", "mode", "transcript", "latency_ms", "success", "error", "http_status", "error_code", "ground_truth", "cer", "exact_match"]))
  return rows
}

async function writeReports(rows) {
  const summary = MODES.map((mode) => {
    const samples = rows.filter((row) => row.mode === mode)
    const successful = samples.filter((row) => row.success)
    const cer = successful.map((row) => row.cer)
    const latency = successful.map((row) => row.latency_ms)
    return { mode, cases: samples.length, success_count: successful.length, mean_cer: cer.length ? cer.reduce((sum, value) => sum + value, 0) / cer.length : "", median_cer: median(cer) ?? "", exact_match_count: successful.filter((row) => row.exact_match).length, mean_latency_ms: latency.length ? Math.round(latency.reduce((sum, value) => sum + value, 0) / latency.length) : "", median_latency_ms: median(latency) ?? "", max_latency_ms: latency.length ? Math.max(...latency) : "" }
  })
  const badcases = rows.filter((row) => !row.success || row.cer > 0).map((row) => ({ case_id: row.case_id, mode: row.mode, ground_truth: row.ground_truth, prediction: row.transcript, cer: row.cer ?? "", main_error: "" }))
  const criticalEntityReview = Array.from(new Set(rows.map((row) => row.case_id))).map((caseId) => {
    const baseline = rows.find((row) => row.case_id === caseId && row.mode === "baseline")
    const hotword = rows.find((row) => row.case_id === caseId && row.mode === "hotword")
    return {
      case_id: caseId,
      ground_truth: baseline?.ground_truth ?? hotword?.ground_truth ?? "",
      baseline_prediction: baseline?.transcript ?? "",
      hotword_prediction: hotword?.transcript ?? "",
      laterality_error: "", jaw_error: "", number_error: "", medical_term_error: "", notes: "",
    }
  })
  await writeFile(path.join(RESULTS, "asr_eval_summary.csv"), toCsv(summary, ["mode", "cases", "success_count", "mean_cer", "median_cer", "exact_match_count", "mean_latency_ms", "median_latency_ms", "max_latency_ms"]))
  await writeFile(path.join(RESULTS, "asr_badcases.csv"), toCsv(badcases, ["case_id", "mode", "ground_truth", "prediction", "cer", "main_error"]))
  await writeFile(path.join(RESULTS, "critical_entity_review.csv"), toCsv(criticalEntityReview, ["case_id", "ground_truth", "baseline_prediction", "hotword_prediction", "laterality_error", "jaw_error", "number_error", "medical_term_error", "notes"]))
  console.table(summary)
}

async function rescoreExistingPredictions(manifest) {
  const rows = []
  for (const mode of MODES) {
    const directory = path.join(RESULTS, mode)
    for (const item of manifest) {
      const stored = JSON.parse(await readFile(path.join(directory, `${item.case_id}.json`), "utf8"))
      const groundTruth = (await readFile(path.join(ROOT, item.ground_truth_file), "utf8")).trim()
      const normalizedGroundTruth = normalize(groundTruth)
      const normalizedPrediction = normalize(stored.transcript ?? "")
      const success = stored.success === true
      rows.push({
        ...stored,
        ground_truth: groundTruth,
        cer: success ? characterErrors(normalizedGroundTruth, normalizedPrediction) / normalizedGroundTruth.length : null,
        exact_match: success && normalizedGroundTruth === normalizedPrediction,
      })
    }
    const modeRows = rows.filter((row) => row.mode === mode)
    await writeFile(path.join(directory, "asr_results.csv"), toCsv(modeRows, ["case_id", "provider", "model", "mode", "transcript", "latency_ms", "success", "error", "http_status", "error_code", "ground_truth", "cer", "exact_match"]))
  }
  await writeReports(rows)
}

async function main() {
  const validateOnly = process.argv.includes("--validate")
  const rescoreOnly = process.argv.includes("--rescore")
  const caseLimitArgument = process.argv.find((argument) => argument.startsWith("--case-limit="))
  const caseLimit = caseLimitArgument ? Number(caseLimitArgument.slice(13)) : null
  const requested = process.argv.find((argument) => argument.startsWith("--mode="))?.slice(7) ?? "all"
  if (!["all", ...MODES].includes(requested)) throw new Error("Use --mode=baseline, --mode=hotword, or --mode=all")
  if (caseLimit !== null && (!Number.isInteger(caseLimit) || caseLimit < 1 || caseLimit > 10)) throw new Error("--case-limit must be an integer from 1 to 10")
  const manifest = await validateDataset()
  if (validateOnly) return
  if (rescoreOnly) return rescoreExistingPredictions(manifest)
  const credential = credentials()
  if (!credential) return
  if (process.argv.includes("--credentials-only")) return
  const modes = requested === "all" ? MODES : [requested]
  const configuredHotwords = modes.includes("hotword") ? await hotwords() : []
  const rows = []
  const selectedManifest = caseLimit === null ? manifest : manifest.slice(0, caseLimit)
  for (const mode of modes) rows.push(...await runMode(mode, selectedManifest, credential, configuredHotwords))
  await writeReports(rows)
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
