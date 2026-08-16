import { z } from "zod"

export const VISION_V2_PREDICTOR_VERSION = "vision-v2"
export const VISION_V2_MODEL = "qwen3.7-plus"
export const VISION_V2_TAXONOMY_VERSION = "dental-photo-view-v1"

const labels = [
  "intraoral_frontal", "intraoral_right_buccal", "intraoral_left_buccal",
  "intraoral_maxillary_occlusal", "intraoral_mandibular_occlusal",
  "extraoral_frontal_relaxed", "extraoral_frontal_smile", "extraoral_right_profile",
  "extraoral_left_profile", "other", "unknown",
] as const

export const VISION_V2_PROMPT = `You are a strict image-view classifier for orthodontic and dental clinical photographs.

Your only task is to classify exactly one input image using the taxonomy "dental-photo-view-v1". Do not diagnose conditions, identify diseases, recommend treatment, infer patient identity, or describe clinical findings.

Use the patient's anatomical left/right, not the viewer's screen left/right.

Allowed labels: ${labels.join(", ")}.

Decision rules:
1. Return unknown rather than guessing whenever a specific taxonomy class is not reliable.
2. If the image is an intraoral side-buccal view but the patient's anatomical left/right cannot be reliably determined from this image alone, return unknown. Do not infer anatomical left/right from the image's screen-left/screen-right orientation. Do not guess.
3. Return other only when the image is sufficiently clear and visibly does not fit any standard taxonomy label.
4. Confidence is your self-assessed confidence in the final output. For unknown, it is confidence that abstention is appropriate.
5. Return exactly one JSON object with exactly these three required fields: taxonomy_version, view_prediction, confidence. Do not add any other field or text.`

export const VisionV2ClassificationSchema = z.object({
  taxonomy_version: z.literal(VISION_V2_TAXONOMY_VERSION),
  view_prediction: z.enum(labels),
  confidence: z.number().finite().min(0).max(1).refine((value) => Number(value.toFixed(2)) === value),
}).strict()

export const VISION_V2_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: { name: "vision_classification_v2", strict: true, schema: {
    type: "object", additionalProperties: false,
    properties: {
      taxonomy_version: { type: "string", const: VISION_V2_TAXONOMY_VERSION },
      view_prediction: { type: "string", enum: labels },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["taxonomy_version", "view_prediction", "confidence"],
  } },
}

export type VisionV2Classification = z.infer<typeof VisionV2ClassificationSchema>
