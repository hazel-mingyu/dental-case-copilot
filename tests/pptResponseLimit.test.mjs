import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  MAX_PPT_RESPONSE_BYTES,
  PPT_RESPONSE_TOO_LARGE_ERROR,
  PPT_RESPONSE_TOO_LARGE_STATUS,
  pptResponseSizeError,
} from "../lib/server/pptResponseLimit.mjs"

test("802 KB PPT is allowed", () => {
  assert.equal(pptResponseSizeError(802 * 1024), null)
})

test("exactly 4 MiB PPT is allowed", () => {
  assert.equal(pptResponseSizeError(MAX_PPT_RESPONSE_BYTES), null)
})

test("PPT larger than 4 MiB is rejected with 413 contract", async () => {
  assert.equal(pptResponseSizeError(MAX_PPT_RESPONSE_BYTES + 1), PPT_RESPONSE_TOO_LARGE_ERROR)
  assert.equal(PPT_RESPONSE_TOO_LARGE_STATUS, 413)
  const route = await readFile(new URL("../app/api/cases/[id]/ppt/route.ts", import.meta.url), "utf8")
  assert.match(route, /errorResponse\(sizeError, PPT_RESPONSE_TOO_LARGE_STATUS\)/)
})
