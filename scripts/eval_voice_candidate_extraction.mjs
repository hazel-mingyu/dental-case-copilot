import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import nextEnv from "@next/env"
import OpenAI from "openai"
import { z } from "zod"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
nextEnv.loadEnvConfig(PROJECT_ROOT)

const ROOT = path.join(PROJECT_ROOT, "data", "eval", "voice_v1", "candidate_extraction_v1")
const PROMPT_PATH = path.join(ROOT, "config", "candidate_extraction_prompt_v1.txt")
const SCHEMA_PATH = path.join(ROOT, "config", "candidate_fact_schema_v1.json")
const CASE_IDS = Array.from({ length: 10 }, (_, index) => `case_${String(index + 1).padStart(2, "0")}`)
const EXPERIMENTS = ["clean_transcript", "asr_transcript"]
const MODEL = "qwen3.7-plus-2026-05-26"

const candidateSchema = z.object({
  category: z.enum(["visit_info", "treatment_action", "observation", "patient_feedback", "follow_up"]),
  content: z.string(),
  evidence_quote: z.string(),
}).strict()
const resultSchema = z.object({ candidates: z.array(candidateSchema) }).strict()

function csvValue(value) {
  const text = String(value ?? "")
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csv(rows, headers) {
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\n") + "\n"
}

function parseArgs(argv) {
  const args = { validate: false, writeReview: false, writeFullReview: false, caseId: null, experiment: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--validate") args.validate = true
    if (arg === "--write-review") args.writeReview = true
    if (arg === "--write-full-review") args.writeFullReview = true
    if (arg === "--case") args.caseId = argv[++index]
    if (arg === "--experiment") args.experiment = argv[++index]
  }
  return args
}

async function readTranscript(caseId, experiment) {
  if (experiment === "clean_transcript") {
    return (await readFile(path.join(PROJECT_ROOT, "data", "eval", "voice_v1", "transcripts", `${caseId}_ground_truth.txt`), "utf8")).trim()
  }

  const baselinePath = path.join(PROJECT_ROOT, "data", "eval", "voice_v1", "results", "aliyun", "baseline", `${caseId}.json`)
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"))
  if (typeof baseline.transcript !== "string" || !baseline.transcript.trim()) {
    throw new Error(`${caseId} baseline ASR transcript missing`)
  }
  return baseline.transcript.trim()
}

function predictionPath(caseId, experiment) {
  return path.join(ROOT, "predictions", experiment, `${caseId}.json`)
}

function runPath(caseId, experiment) {
  return path.join(ROOT, "runs", experiment, `${caseId}.json`)
}

function evidenceValid(transcript, evidenceQuote) {
  return Boolean(evidenceQuote) && transcript.includes(evidenceQuote)
}

async function validateInputs() {
  await Promise.all([readFile(PROMPT_PATH, "utf8"), readFile(SCHEMA_PATH, "utf8")])
  for (const caseId of CASE_IDS) {
    for (const experiment of EXPERIMENTS) {
      const transcript = await readTranscript(caseId, experiment)
      if (!transcript) throw new Error(`${caseId} ${experiment} transcript empty`)
    }
  }
  console.log(`dataset validation: PASS (${CASE_IDS.length} cases × ${EXPERIMENTS.length} experiments)`)
}

async function runOne(caseId, experiment) {
  if (!CASE_IDS.includes(caseId)) throw new Error(`Unsupported smoke case: ${caseId}`)
  if (!EXPERIMENTS.includes(experiment)) throw new Error(`Unsupported experiment: ${experiment}`)
  if (!process.env.DASHSCOPE_API_KEY || !process.env.DASHSCOPE_BASE_URL) {
    throw new Error("DASHSCOPE_API_KEY and DASHSCOPE_BASE_URL are required")
  }

  const [prompt, schemaText, transcript] = await Promise.all([
    readFile(PROMPT_PATH, "utf8"),
    readFile(SCHEMA_PATH, "utf8"),
    readTranscript(caseId, experiment),
  ])
  const schema = JSON.parse(schemaText)
  const client = new OpenAI({ apiKey: process.env.DASHSCOPE_API_KEY, baseURL: process.env.DASHSCOPE_BASE_URL })
  const startedAt = performance.now()
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: `Transcript：\n${transcript}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "candidate_fact_extraction_v1", strict: true, schema },
    },
  })
  const latencyMs = Math.round(performance.now() - startedAt)
  const content = completion.choices?.[0]?.message?.content
  if (!content) throw new Error("Model returned empty content")
  const result = resultSchema.parse(JSON.parse(content))
  const validCount = result.candidates.filter((candidate) => evidenceValid(transcript, candidate.evidence_quote)).length

  await mkdir(path.dirname(predictionPath(caseId, experiment)), { recursive: true })
  await mkdir(path.dirname(runPath(caseId, experiment)), { recursive: true })
  await writeFile(predictionPath(caseId, experiment), `${JSON.stringify(result, null, 2)}\n`, "utf8")
  await writeFile(runPath(caseId, experiment), `${JSON.stringify({
    case_id: caseId,
    experiment,
    model: MODEL,
    prompt_version: "candidate_extraction_v1",
    latency_ms: latencyMs,
    api_success: true,
    json_parse_success: true,
    schema_valid: true,
    candidate_count: result.candidates.length,
    evidence_valid_count: validCount,
  }, null, 2)}\n`, "utf8")
  console.log(`${caseId} ${experiment}: PASS candidates=${result.candidates.length} evidence_valid=${validCount}/${result.candidates.length} latency_ms=${latencyMs}`)
}

async function writeReview() {
  const reviewRows = []
  const runRows = []
  for (const caseId of CASE_IDS) {
    for (const experiment of EXPERIMENTS) {
      const [transcript, predictionText, runText] = await Promise.all([
        readTranscript(caseId, experiment),
        readFile(predictionPath(caseId, experiment), "utf8"),
        readFile(runPath(caseId, experiment), "utf8"),
      ])
      const prediction = resultSchema.parse(JSON.parse(predictionText))
      const run = JSON.parse(runText)
      runRows.push(run)
      for (const candidate of prediction.candidates) {
        reviewRows.push({
          case_id: caseId,
          experiment,
          transcript,
          candidate_category: candidate.category,
          candidate_content: candidate.content,
          evidence_quote: candidate.evidence_quote,
          evidence_valid: evidenceValid(transcript, candidate.evidence_quote),
        })
      }
    }
  }
  const reviewDir = path.join(ROOT, "review")
  await mkdir(reviewDir, { recursive: true })
  await writeFile(path.join(reviewDir, "candidate_extraction_review.csv"), csv(reviewRows, [
    "case_id", "experiment", "transcript", "candidate_category", "candidate_content", "evidence_quote", "evidence_valid",
  ]), "utf8")
  await writeFile(path.join(reviewDir, "candidate_extraction_run.csv"), csv(runRows, [
    "case_id", "experiment", "model", "prompt_version", "latency_ms", "candidate_count", "evidence_valid_count",
  ]), "utf8")
  const validCount = reviewRows.filter((row) => row.evidence_valid).length
  console.log(`review artifact: PASS rows=${reviewRows.length} evidence_valid=${validCount}/${reviewRows.length}`)
}

function evidenceRate(validCount, candidateCount) {
  return candidateCount === 0 ? "NA" : (validCount / candidateCount).toFixed(4)
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

async function writeFullReview() {
  const reviewRows = []
  const caseRows = []
  const runRows = []
  for (const caseId of CASE_IDS) {
    const byExperiment = {}
    for (const experiment of EXPERIMENTS) {
      const [transcript, predictionText, runText] = await Promise.all([
        readTranscript(caseId, experiment),
        readFile(predictionPath(caseId, experiment), "utf8"),
        readFile(runPath(caseId, experiment), "utf8"),
      ])
      const prediction = resultSchema.parse(JSON.parse(predictionText))
      const run = JSON.parse(runText)
      const evidenceValidCount = prediction.candidates.filter((candidate) => evidenceValid(transcript, candidate.evidence_quote)).length
      byExperiment[experiment] = { candidateCount: prediction.candidates.length, evidenceValidCount }
      runRows.push({ ...run, evidence_valid_count: evidenceValidCount })
      for (const candidate of prediction.candidates) {
        reviewRows.push({
          case_id: caseId,
          experiment,
          transcript,
          category: candidate.category,
          content: candidate.content,
          evidence_quote: candidate.evidence_quote,
          evidence_valid: evidenceValid(transcript, candidate.evidence_quote),
          candidate_correct: "",
          category_error: "",
          critical_entity_error: "",
          important_fact_omitted: "",
          unsupported_fact: "",
          notes: "",
        })
      }
    }
    caseRows.push({
      case_id: caseId,
      clean_candidate_count: byExperiment.clean_transcript.candidateCount,
      asr_candidate_count: byExperiment.asr_transcript.candidateCount,
      clean_evidence_valid_rate: evidenceRate(byExperiment.clean_transcript.evidenceValidCount, byExperiment.clean_transcript.candidateCount),
      asr_evidence_valid_rate: evidenceRate(byExperiment.asr_transcript.evidenceValidCount, byExperiment.asr_transcript.candidateCount),
      candidate_recall_error: "",
      category_error: "",
      critical_entity_error: "",
      asr_propagation_error: "",
      notes: "",
    })
  }

  const summaryRows = EXPERIMENTS.map((experiment) => {
    const runs = runRows.filter((row) => row.experiment === experiment)
    const candidateCount = runs.reduce((sum, row) => sum + row.candidate_count, 0)
    const validCount = runs.reduce((sum, row) => sum + row.evidence_valid_count, 0)
    const latencies = runs.map((row) => row.latency_ms)
    return {
      experiment,
      api_success_rate: (runs.filter((row) => row.api_success).length / CASE_IDS.length).toFixed(4),
      json_parse_success_rate: (runs.filter((row) => row.json_parse_success).length / CASE_IDS.length).toFixed(4),
      schema_validity_rate: (runs.filter((row) => row.schema_valid).length / CASE_IDS.length).toFixed(4),
      candidate_count: candidateCount,
      evidence_valid_count: validCount,
      evidence_invalid_count: candidateCount - validCount,
      evidence_validation_rate: evidenceRate(validCount, candidateCount),
      mean_candidates_per_case: (candidateCount / CASE_IDS.length).toFixed(2),
      mean_latency_ms: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
      median_latency_ms: median(latencies),
      max_latency_ms: Math.max(...latencies),
    }
  })
  const reviewDir = path.join(ROOT, "review")
  await mkdir(reviewDir, { recursive: true })
  await writeFile(path.join(reviewDir, "candidate_extraction_review_full.csv"), csv(reviewRows, [
    "case_id", "experiment", "transcript", "category", "content", "evidence_quote", "evidence_valid", "candidate_correct", "category_error", "critical_entity_error", "important_fact_omitted", "unsupported_fact", "notes",
  ]), "utf8")
  await writeFile(path.join(reviewDir, "candidate_extraction_case_review.csv"), csv(caseRows, [
    "case_id", "clean_candidate_count", "asr_candidate_count", "clean_evidence_valid_rate", "asr_evidence_valid_rate", "candidate_recall_error", "category_error", "critical_entity_error", "asr_propagation_error", "notes",
  ]), "utf8")
  await writeFile(path.join(reviewDir, "candidate_extraction_summary_full.csv"), csv(summaryRows, [
    "experiment", "api_success_rate", "json_parse_success_rate", "schema_validity_rate", "candidate_count", "evidence_valid_count", "evidence_invalid_count", "evidence_validation_rate", "mean_candidates_per_case", "mean_latency_ms", "median_latency_ms", "max_latency_ms",
  ]), "utf8")
  console.log(`full review: PASS rows=${reviewRows.length} cases=${caseRows.length}`)
}

const args = parseArgs(process.argv.slice(2))
if (args.validate) await validateInputs()
if (args.caseId || args.experiment) {
  if (!args.caseId || !args.experiment) throw new Error("--case and --experiment must be provided together")
  await runOne(args.caseId, args.experiment)
}
if (args.writeReview) await writeReview()
if (args.writeFullReview) await writeFullReview()
if (!args.validate && !args.caseId && !args.writeReview && !args.writeFullReview) {
  console.log("Usage: --validate | --case <case_id> --experiment <clean_transcript|asr_transcript> | --write-review | --write-full-review")
}
