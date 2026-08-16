import "server-only"

import OpenAI from "openai"
import {
  VISION_CLASSIFICATION_PROMPT,
  VISION_CLASSIFICATION_RESPONSE_FORMAT,
  VISION_MODEL,
  VisionClassificationSchema,
  type VisionClassification,
} from "../visionClassificationContract"

export type VisionClassificationErrorCode =
  | "missing_provider_api_key"
  | "missing_provider_base_url"
  | "provider_timeout"
  | "provider_error"
  | "model_refusal"
  | "invalid_model_output"

export class VisionClassificationError extends Error {
  constructor(public readonly code: VisionClassificationErrorCode) {
    super(code)
  }
}

function logInvalidModelOutput(
  content: string,
  jsonParseSucceeded: boolean,
  issues?: Array<{
    path: PropertyKey[]
    expected?: unknown
    received?: unknown
    message: string
  }>
) {
  if (process.env.NODE_ENV !== "development") {
    return
  }

  console.error("Vision model output failed contract validation", {
    rawMessageContent: content,
    jsonParseSucceeded,
    zodIssues: issues ?? [],
  })
}

function logProviderError(error: unknown) {
  if (process.env.NODE_ENV !== "development" || !(error instanceof OpenAI.APIError)) {
    return
  }

  console.error("Vision provider request failed", {
    providerHttpStatus: error.status,
    providerErrorCode: error.code,
    providerErrorType: error.type,
    providerErrorParam: error.param,
    providerErrorMessage: error.message,
    providerRequestId: error.requestID,
  })
}

export async function classifyVisionImage(
  imageUrl: string
): Promise<VisionClassification> {
  const apiKey = process.env.DASHSCOPE_API_KEY
  const baseURL = process.env.DASHSCOPE_BASE_URL

  if (!apiKey) {
    throw new VisionClassificationError("missing_provider_api_key")
  }

  if (!baseURL) {
    throw new VisionClassificationError("missing_provider_base_url")
  }

  const openai = new OpenAI({
    apiKey,
    baseURL,
    timeout: 45_000,
    maxRetries: 0,
  })

  try {
    const completion = await openai.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        { role: "system", content: VISION_CLASSIFICATION_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Classify this single image and return the required JSON object.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      response_format: VISION_CLASSIFICATION_RESPONSE_FORMAT,
    })

    const content = completion.choices[0]?.message.content

    if (!content) {
      throw new VisionClassificationError("model_refusal")
    }

    let rawOutput: unknown

    try {
      rawOutput = JSON.parse(content)
    } catch {
      logInvalidModelOutput(content, false)
      throw new VisionClassificationError("invalid_model_output")
    }

    const parsed = VisionClassificationSchema.safeParse(rawOutput)

    if (!parsed.success) {
      logInvalidModelOutput(
        content,
        true,
        parsed.error.issues.map((issue) => ({
          path: issue.path,
          expected: "expected" in issue ? issue.expected : undefined,
          received: "received" in issue ? issue.received : issue.input,
          message: issue.message,
        }))
      )
      throw new VisionClassificationError("invalid_model_output")
    }

    return parsed.data
  } catch (error) {
    if (error instanceof VisionClassificationError) {
      throw error
    }

    logProviderError(error)

    if (error instanceof Error && error.name.toLowerCase().includes("timeout")) {
      throw new VisionClassificationError("provider_timeout")
    }

    throw new VisionClassificationError("provider_error")
  }
}
