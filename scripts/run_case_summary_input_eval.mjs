import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"
import { CASE_SUMMARY_MODEL, generateCaseSummary } from "../lib/server/caseSummaryGeneration.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
nextEnv.loadEnvConfig(ROOT)
const EVAL_ROOT = path.join(ROOT, "data", "eval", "case_summary_v1"), INPUT_DIR = path.join(EVAL_ROOT, "inputs"), OUTPUT_DIR = path.join(EVAL_ROOT, "outputs")
async function main() { await mkdir(OUTPUT_DIR, { recursive: true }); const summary = []; for (const file of (await readdir(INPUT_DIR)).filter((name) => /^eval_case_\d+\.json$/.test(name)).sort()) { const input = JSON.parse(await readFile(path.join(INPUT_DIR, file), "utf8")), start = performance.now(), result = await generateCaseSummary(input), output = { case_id: input.case_id, summary_mode: input.summary_mode, input_timepoints: input.timepoints, provider: "dashscope", model: CASE_SUMMARY_MODEL, raw_model_output: result.raw_model_output, parsed_summary_json: result.parsed_summary_json, automatic_contract_checks: result.automatic_contract_checks, error: result.error, retry_count: result.retry_count ?? 0, latency_ms: Math.round(performance.now() - start) }; await writeFile(path.join(OUTPUT_DIR, file), JSON.stringify(output, null, 2) + "\n"); summary.push({ case_id: output.case_id, summary_mode: output.summary_mode, provider_success: output.raw_model_output !== null, ...(output.automatic_contract_checks ?? { json_parse: false, strict_schema: false, mode_contract: false, provenance: false, timeline: false, overall: false }), error: output.error, latency_ms: output.latency_ms }); console.log(`${output.case_id}: ${output.automatic_contract_checks?.overall ? "PASS" : "FAIL"}`) } await writeFile(path.join(EVAL_ROOT, "run_summary.json"), JSON.stringify({ provider: "dashscope", model: CASE_SUMMARY_MODEL, cases: summary, overall: summary.every((item) => item.overall) ? "PASS" : "FAIL" }, null, 2) + "\n") }
await main()
