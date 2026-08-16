import { NextResponse } from "next/server"
import { VISION_PROVIDER } from "../../../../../lib/visionClassificationContract"
import {
  VISION_V2_MODEL,
  VISION_V2_PREDICTOR_VERSION,
  VISION_V2_TAXONOMY_VERSION,
} from "../../../../../lib/visionClassificationContractV2"
import { createServerSupabaseClient } from "../../../../../lib/server/supabase"
import {
  classifyVisionImageV2,
  VisionV2ClassificationError,
} from "../../../../../lib/server/visionClassifierV2"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }
type InferenceRunErrorType =
  | "timeout"
  | "provider_error"
  | "validation_error"
  | "prediction_persist_error"

function failure(code: string, status: number) {
  return NextResponse.json({ ok: false, code }, { status })
}

function getInferenceRunErrorType(
  error: unknown
): InferenceRunErrorType {
  if (!(error instanceof VisionV2ClassificationError)) {
    return "provider_error"
  }

  if (error.code === "provider_timeout") {
    return "timeout"
  }

  if (error.code === "invalid_model_output" || error.code === "model_refusal") {
    return "validation_error"
  }

  return "provider_error"
}

export async function POST(_request: Request, context: RouteContext) {
  const { id: imageId } = await context.params
  const supabase = createServerSupabaseClient()

  if (process.env.NODE_ENV === "development") {
    console.info("Vision prediction requested", {
      imageId,
      predictorVersion: VISION_V2_PREDICTOR_VERSION,
    })
  }

  async function recordInferenceRun({
    predictionId = null,
    latencyMs,
    success,
    errorType = null,
  }: {
    predictionId?: string | null
    latencyMs: number
    success: boolean
    errorType?: InferenceRunErrorType | null
  }) {
    try {
      const { error } = await supabase.from("vision_inference_runs").insert({
        image_id: imageId,
        prediction_id: predictionId,
        model: VISION_V2_MODEL,
        predictor_version: VISION_V2_PREDICTOR_VERSION,
        latency_ms: latencyMs,
        success,
        error_type: errorType,
      })

      if (!error) {
        return
      }

      console.error("Vision inference run telemetry failed", {
        imageId,
        code: error.code,
      })
    } catch (error) {
      console.error("Vision inference run telemetry failed", { imageId, error })
    }
  }

  const { data: existingPrediction, error: existingPredictionError } =
    await supabase
      .from("image_predictions")
      .select("id")
      .eq("image_id", imageId)
      .eq("predictor_version", VISION_V2_PREDICTOR_VERSION)
      .eq("taxonomy_version", VISION_V2_TAXONOMY_VERSION)
      .limit(1)
      .maybeSingle()

  if (existingPredictionError) {
    console.error("Vision prediction lookup failed", {
      imageId,
      code: existingPredictionError.code,
    })
    return failure("prediction_lookup_failed", 500)
  }

  if (existingPrediction) {
    return NextResponse.json({ ok: true, status: "already_exists", predictorVersion: VISION_V2_PREDICTOR_VERSION })
  }

  const { data: image, error: imageError } = await supabase
    .from("case_images")
    .select("id,image_path")
    .eq("id", imageId)
    .single()

  if (imageError || !image) {
    console.error("Vision image lookup failed", {
      imageId,
      code: imageError?.code,
    })
    return failure("storage_read_failed", 404)
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from("case-images")
    .createSignedUrl(image.image_path, 300)

  if (signedUrlError || !signedUrl?.signedUrl) {
    console.error("Vision signed URL creation failed", {
      imageId,
      statusCode: signedUrlError?.statusCode,
    })
    return failure("storage_url_failed", 500)
  }

  const providerRequestStartedAt = performance.now()
  let classification

  try {
    classification = await classifyVisionImageV2(signedUrl.signedUrl)
  } catch (error) {
    const latencyMs = Math.round(performance.now() - providerRequestStartedAt)
    const errorType = getInferenceRunErrorType(error)

    await recordInferenceRun({ latencyMs, success: false, errorType })

    const code =
      error instanceof VisionV2ClassificationError
        ? error.code
        : "provider_error"

    console.error("Vision classification failed", {
      imageId,
      predictorVersion: VISION_V2_PREDICTOR_VERSION,
      provider: VISION_PROVIDER,
      model: VISION_V2_MODEL,
      code,
    })
    return failure(
      code,
      code === "missing_provider_api_key" || code === "missing_provider_base_url"
        ? 500
        : 502
    )
  }

  const latencyMs = Math.round(performance.now() - providerRequestStartedAt)

  try {
    const { data: prediction, error: insertError } = await supabase
      .from("image_predictions")
      .insert({
        image_id: image.id,
        ...classification,
        predictor_version: VISION_V2_PREDICTOR_VERSION,
      })
      .select("id,image_id,predictor_version,view_prediction")
      .single()

    if (insertError) {
      await recordInferenceRun({
        latencyMs,
        success: false,
        errorType: "prediction_persist_error",
      })

      if (insertError.code === "23505") {
        return NextResponse.json({ ok: true, status: "already_exists", predictorVersion: VISION_V2_PREDICTOR_VERSION })
      }

      console.error("Vision prediction insert failed", {
        imageId,
        code: insertError.code,
      })
      return failure("prediction_insert_failed", 500)
    }

    await recordInferenceRun({
      predictionId: prediction.id,
      latencyMs,
      success: true,
    })

    if (process.env.NODE_ENV === "development") {
      console.info("Vision prediction persisted", {
        imageId: prediction.image_id,
        predictionId: prediction.id,
        predictorVersion: prediction.predictor_version,
        aiPrediction: prediction.view_prediction,
      })
    }

    return NextResponse.json({ ok: true, status: "created", predictorVersion: VISION_V2_PREDICTOR_VERSION, predictionId: prediction.id }, { status: 201 })
  } catch (error) {
    console.error("Vision prediction persistence failed", {
      imageId,
      predictorVersion: VISION_V2_PREDICTOR_VERSION,
      model: VISION_V2_MODEL,
      error,
    })
    return failure("prediction_insert_failed", 500)
  }
}
