import "server-only"

import OpenAI from "openai"
import {
  VISION_V2_MODEL,
  VISION_V2_PROMPT,
  VISION_V2_RESPONSE_FORMAT,
  VisionV2ClassificationSchema,
  type VisionV2Classification,
} from "../visionClassificationContractV2"

export type VisionV2ClassificationErrorCode =
  | "missing_provider_api_key"
  | "missing_provider_base_url"
  | "provider_timeout"
  | "provider_error"
  | "model_refusal"
  | "invalid_model_output"

export class VisionV2ClassificationError extends Error {
  constructor(public readonly code: VisionV2ClassificationErrorCode) {
    super(code)
  }
}

function logInvalidModelOutput(content: string, jsonParseSucceeded: boolean) {
  if (process.env.NODE_ENV !== "development") return
  console.error("Vision-v2 model output failed contract validation", {
    rawMessageContent: content,
    jsonParseSucceeded,
  })
}

function logProviderError(error: unknown) {
  if (process.env.NODE_ENV !== "development" || !(error instanceof OpenAI.APIError)) return
  console.error("Vision-v2 provider request failed", {
    providerHttpStatus: error.status,
    providerErrorCode: error.code,
    providerErrorType: error.type,
    providerErrorParam: error.param,
    providerErrorMessage: error.message,
    providerRequestId: error.requestID,
  })
}

export async function classifyVisionImageV2(imageUrl: string): Promise<VisionV2Classification> {
  const apiKey = process.env.DASHSCOPE_API_KEY
  const baseURL = process.env.DASHSCOPE_BASE_URL
  if (!apiKey) throw new VisionV2ClassificationError("missing_provider_api_key")
  if (!baseURL) throw new VisionV2ClassificationError("missing_provider_base_url")

  const openai = new OpenAI({ apiKey, baseURL, timeout: 45_000, maxRetries: 0 })
  try {
    const completion = await openai.chat.completions.create({
      model: VISION_V2_MODEL,
      messages: [
        { role: "system", content: VISION_V2_PROMPT },
        { role: "user", content: [
          { type: "text", text: "Classify this single image and return the required JSON object." },
          { type: "image_url", image_url: { url: imageUrl } },
        ] },
      ],
      response_format: VISION_V2_RESPONSE_FORMAT,
    })
    const content = completion.choices[0]?.message.content
    if (!content) throw new VisionV2ClassificationError("model_refusal")

    let rawOutput: unknown
    try { rawOutput = JSON.parse(content) } catch {
      logInvalidModelOutput(content, false)
      throw new VisionV2ClassificationError("invalid_model_output")
    }
    const parsed = VisionV2ClassificationSchema.safeParse(rawOutput)
    if (!parsed.success) {
      logInvalidModelOutput(content, true)
      throw new VisionV2ClassificationError("invalid_model_output")
    }
    return parsed.data
  } catch (error) {
    if (error instanceof VisionV2ClassificationError) throw error
    logProviderError(error)
    if (error instanceof Error && error.name.toLowerCase().includes("timeout")) {
      throw new VisionV2ClassificationError("provider_timeout")
    }
    throw new VisionV2ClassificationError("provider_error")
  }
}
