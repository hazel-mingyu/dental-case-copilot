import { createClient } from "@supabase/supabase-js"

const EXECUTE = process.argv.includes("--execute")
const BUCKET = "case-images"
const STORAGE_BATCH_SIZE = 100

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function errorDetails(error) {
  return error ? {
    message: error.message ?? String(error),
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    statusCode: error.statusCode ?? null,
  } : null
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true })
  if (error) throw new Error(`${table} count failed: ${JSON.stringify(errorDetails(error))}`)
  return count ?? 0
}

async function main() {
  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
  const { data: images, error: imageError } = await supabase
    .from("case_images")
    .select("id,case_id,image_path,timepoint_id")
    .order("id")
  if (imageError) throw new Error(`case_images read failed: ${JSON.stringify(errorDetails(imageError))}`)

  const paths = [...new Set((images ?? []).map((image) => image.image_path).filter(Boolean))]
  const before = {
    cases: await countRows(supabase, "cases"),
    case_timepoints: await countRows(supabase, "case_timepoints"),
    case_images: images?.length ?? 0,
    image_reviews: await countRows(supabase, "image_reviews"),
    image_predictions: await countRows(supabase, "image_predictions"),
    vision_inference_runs: await countRows(supabase, "vision_inference_runs"),
    unique_storage_paths: paths.length,
  }

  console.log(JSON.stringify({ mode: EXECUTE ? "EXECUTE" : "DRY RUN", bucket: BUCKET, before, case_images: images ?? [], storage_paths: paths }, null, 2))
  if (!EXECUTE) return

  console.warn("WARNING: This will permanently delete all case photo files and all photo-related database rows. Cases will be preserved.")
  const storageBatches = []
  for (let start = 0; start < paths.length; start += STORAGE_BATCH_SIZE) {
    const batch = paths.slice(start, start + STORAGE_BATCH_SIZE)
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch)
    const result = { requested_paths: batch, deleted_count: data?.length ?? 0, error: errorDetails(error) }
    storageBatches.push(result)
    console.log(JSON.stringify({ stage: "storage_remove", ...result }))
    if (error) {
      throw new Error(`Storage deletion failed; database cleanup was not started: ${JSON.stringify(result)}`)
    }
  }

  const deleted = {}
  for (const table of ["vision_inference_runs", "image_reviews", "image_predictions", "case_images", "case_timepoints"]) {
    const { data, error } = await supabase.from(table).delete().not("id", "is", null).select("id")
    if (error) throw new Error(`Database deletion failed at ${table}: ${JSON.stringify(errorDetails(error))}`)
    deleted[table] = data?.length ?? 0
    console.log(JSON.stringify({ stage: "database_delete", table, deleted_count: deleted[table] }))
  }

  const after = {
    cases: await countRows(supabase, "cases"),
    case_timepoints: await countRows(supabase, "case_timepoints"),
    case_images: await countRows(supabase, "case_images"),
    image_reviews: await countRows(supabase, "image_reviews"),
    image_predictions: await countRows(supabase, "image_predictions"),
    vision_inference_runs: await countRows(supabase, "vision_inference_runs"),
  }
  console.log(JSON.stringify({ mode: "EXECUTE", bucket: BUCKET, deleted, storage: { before: paths.length, batches: storageBatches, remaining_for_case_photos: 0 }, after, cases_preserved: after.cases === before.cases }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
