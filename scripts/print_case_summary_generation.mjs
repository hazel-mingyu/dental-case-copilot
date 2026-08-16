import nextEnv from "@next/env"
import { createClient } from "@supabase/supabase-js"
import { buildCaseSummaryInput } from "../lib/server/caseSummaryInput.mjs"
import { generateCaseSummary } from "../lib/server/caseSummaryGeneration.mjs"

nextEnv.loadEnvConfig(process.cwd())
const caseId = process.argv[2]
if (!caseId) throw new Error("Usage: node scripts/print_case_summary_generation.mjs <case_id>")
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
const startedAt = performance.now()
try {
  console.error("[case-summary-debug] input_builder:start")
  const input = await buildCaseSummaryInput(supabase, caseId)
  console.error(`[case-summary-debug] input_builder:done mode=${input.summary_mode} timepoints=${input.timepoints.length}`)
  console.error("[case-summary-debug] generation:start")
  const result = await generateCaseSummary(input)
  console.error(`[case-summary-debug] generation:done elapsed_ms=${Math.round(performance.now() - startedAt)} error=${result.error ?? "none"}`)
  process.stdout.write(JSON.stringify(result, null, 2) + "\n")
  if (result.error) process.exitCode = 1
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`[case-summary-debug] harness_error elapsed_ms=${Math.round(performance.now() - startedAt)}\n${message}`)
  process.exitCode = 1
}
