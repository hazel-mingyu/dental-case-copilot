import nextEnv from "@next/env"
import { createClient } from "@supabase/supabase-js"
import { buildCaseSummaryInput } from "../lib/server/caseSummaryInput.mjs"

nextEnv.loadEnvConfig(process.cwd())
const caseId = process.argv[2]
if (!caseId) throw new Error("Usage: node scripts/print_case_summary_input.mjs <case_id>")
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
console.log(JSON.stringify(await buildCaseSummaryInput(supabase, caseId), null, 2))
