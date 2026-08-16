import { readFile } from "node:fs/promises"
import path from "node:path"
import OpenAI from "openai"
import { z } from "zod"

const VOICE_EVAL_ROOT = path.join(process.cwd(), "data", "eval", "voice_v1")
const NORMALIZATION_ROOT = path.join(VOICE_EVAL_ROOT, "voice_review_normalization_v1")
const ASR_MODEL = "qwen-audio-3.0-asr-flash"
const CANDIDATE_MODEL = "qwen3.7-plus-2026-05-26"

export const candidateCategorySchema = z.enum([
  "visit_info",
  "treatment_action",
  "observation",
  "patient_feedback",
  "follow_up",
])
export type CandidateCategory = z.infer<typeof candidateCategorySchema>

export type VoiceCandidate = { category: CandidateCategory; content: string; evidence_quote: string; evidence_valid: boolean; segment_valid: boolean }

export class VoiceServiceError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code)
  }
}

function credentials() {
  const apiKey = process.env.DASHSCOPE_API_KEY
  const baseUrl = process.env.DASHSCOPE_BASE_URL
  if (!apiKey || !baseUrl) throw new VoiceServiceError("credential_missing", 500)
  return { apiKey, baseUrl }
}

function evidenceValid(transcript: string, evidenceQuote: string) {
  return Boolean(evidenceQuote) && transcript.includes(evidenceQuote)
}

export async function transcribeVoice(audio: Uint8Array, mimeType: string) {
  const { apiKey, baseUrl } = credentials()
  const endpoint = new URL("/api/v1/services/aigc/multimodal-generation/generation", new URL(baseUrl).origin)
  const audioBase64 = Buffer.from(audio).toString("base64")
  const audioFormat = mimeType.includes("webm") ? "webm" : mimeType.includes("ogg") ? "ogg" : "m4a"
  const startedAt = performance.now()
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-SSE": "disable",
      },
      body: JSON.stringify({
        model: ASR_MODEL,
        input: { messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:audio/${audioFormat};base64,${audioBase64}` } }] }] },
        parameters: { format: audioFormat },
      }),
    })
  } catch {
    throw new VoiceServiceError("asr_network_error", 502)
  }
  const body = await response.json().catch(() => ({})) as { output?: { output?: { sentence?: { text?: string } }; text?: string }; error?: { code?: string; message?: string } }
  if (!response.ok) {
    console.error("Voice ASR provider error", { status: response.status, code: body.error?.code })
    throw new VoiceServiceError("asr_provider_error", 502)
  }
  const transcript = body.output?.output?.sentence?.text ?? body.output?.text
  if (typeof transcript !== "string" || !transcript.trim()) throw new VoiceServiceError("asr_empty_transcript", 502)
  return { transcript: transcript.trim(), latency_ms: Math.round(performance.now() - startedAt) }
}

export async function extractVoiceCandidates(transcript: string): Promise<{ normalized_text: string; segments: VoiceCandidate[] }> {
  if (!transcript.trim()) throw new VoiceServiceError("transcript_empty", 400)
  const { apiKey, baseUrl } = credentials()
  const [prompt, schemaText] = await Promise.all([
    readFile(path.join(NORMALIZATION_ROOT, "prompt.txt"), "utf8"),
    readFile(path.join(NORMALIZATION_ROOT, "schema.json"), "utf8"),
  ])
  const client = new OpenAI({ apiKey, baseURL: baseUrl })
  let completion
  try {
    completion = await client.chat.completions.create({
      model: CANDIDATE_MODEL,
      messages: [{ role: "system", content: prompt }, { role: "user", content: `Transcript：\n${transcript}` }],
      response_format: { type: "json_schema", json_schema: { name: "voice_review_normalization_v1", strict: true, schema: JSON.parse(schemaText) } },
    })
  } catch {
    throw new VoiceServiceError("candidate_provider_error", 502)
  }
  const content = completion.choices?.[0]?.message?.content
  if (!content) throw new VoiceServiceError("candidate_empty_response", 502)
  let parsed
  try {
    parsed = z.object({ normalized_text: z.string(), segments: z.array(z.object({ category: candidateCategorySchema, text: z.string(), evidence_quote: z.string() }).strict()) }).strict().parse(JSON.parse(content))
  } catch {
    throw new VoiceServiceError("candidate_invalid_response", 502)
  }
  return { normalized_text: parsed.normalized_text, segments: parsed.segments.map((segment) => ({ category: segment.category, content: segment.text, evidence_quote: segment.evidence_quote, evidence_valid: evidenceValid(transcript, segment.evidence_quote), segment_valid: Boolean(segment.text) && parsed.normalized_text.includes(segment.text) })) }
}
