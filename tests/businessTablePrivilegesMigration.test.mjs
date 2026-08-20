import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../supabase/migrations/20260820_s4_harden_business_table_privileges.sql", import.meta.url), "utf8")
const matrix = {
  cases: "SELECT, UPDATE, DELETE",
  case_timepoints: "SELECT, INSERT, UPDATE, DELETE",
  case_images: "SELECT, INSERT, DELETE",
  case_voice_notes: "SELECT, INSERT, UPDATE, DELETE",
  case_summaries: "SELECT, INSERT, UPDATE",
  image_reviews: "SELECT, INSERT, UPDATE",
  image_predictions: "SELECT",
  vision_inference_runs: null,
}

test("revokes every business table from anon and authenticated before grants", () => {
  for (const table of Object.keys(matrix)) {
    assert.match(migration, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated;`))
  }
  assert.doesNotMatch(migration, /GRANT[\s\S]*?ON TABLE public\.[^;]+ TO anon;/)
})

test("grants exactly the authenticated table matrix without unsafe privileges", () => {
  for (const [table, privileges] of Object.entries(matrix)) {
    const grants = [...migration.matchAll(new RegExp(`GRANT ([A-Z, ]+) ON TABLE public\\.${table} TO authenticated;`, "g"))]
    if (privileges === null) {
      assert.equal(grants.length, 0)
    } else {
      assert.deepEqual(grants.map((match) => match[1]), [privileges])
    }
  }
  assert.doesNotMatch(migration, /GRANT[^;]*(TRUNCATE|TRIGGER|REFERENCES)[^;]*TO authenticated;/)
})

test("business functions revoke PUBLIC and anon then grant only authenticated execute", () => {
  const functions = ["public.create_case\\(text\\)", "public.consume_daily_api_quota\\(text\\)", "private.can_access_case_image\\(text\\)", "public.dentcase_set_updated_at\\(\\)"]
  for (const fn of functions) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon;`))
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated;`))
  }
})

test("does not contain destructive schema, policy, data, or cascade operations", () => {
  assert.doesNotMatch(migration, /DROP\s+(TABLE|POLICY|FUNCTION)/i)
  assert.doesNotMatch(migration, /DELETE\s+FROM/i)
  assert.doesNotMatch(migration, /\bCASCADE\b/i)
})
