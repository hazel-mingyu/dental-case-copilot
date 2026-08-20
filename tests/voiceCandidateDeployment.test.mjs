import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const voiceSource = await readFile(new URL("../lib/server/voice.ts", import.meta.url), "utf8")
const routeSource = await readFile(new URL("../app/api/voice/extract-candidates/route.ts", import.meta.url), "utf8")
const resourceSource = await readFile(new URL("../lib/server/voiceCandidateResources.ts", import.meta.url), "utf8")

test("production candidate extraction has no data/eval filesystem dependency", () => {
  assert.doesNotMatch(voiceSource, /node:fs|process\.cwd\(\)|data\/eval|readFile/)
})

test("bundled candidate resources contain the prompt and required schema fields", () => {
  assert.match(resourceSource, /export const voiceCandidatePrompt = `[^`]+`/)
  assert.match(resourceSource, /normalized_text/)
  assert.match(resourceSource, /segments/)
  assert.match(resourceSource, /evidence_quote/)
})

test("invalid transcript validation and resource preparation precede quota", () => {
  assert.ok(routeSource.indexOf("typeof body.transcript") < routeSource.lastIndexOf("consumeDailyApiQuota"))
  assert.ok(routeSource.indexOf("prepareVoiceCandidateResources()") < routeSource.lastIndexOf("consumeDailyApiQuota"))
})

test("quota rejection is before provider invocation", () => {
  assert.ok(routeSource.lastIndexOf("dailyApiQuotaExceededResponse()") < routeSource.lastIndexOf("extractVoiceCandidates(transcript)"))
})

test("candidate provider uses one SDK attempt", () => {
  assert.match(voiceSource, /new OpenAI\(\{ apiKey, baseURL: baseUrl, maxRetries: 0 \}\)/)
})
