import { z } from "zod"

export const VISION_PREDICTOR_VERSION = "vision-v1"
export const VISION_PROVIDER = "Alibaba Cloud Model Studio / Qwen"
export const VISION_MODEL = "qwen3.7-plus"
export const VISION_TAXONOMY_VERSION = "dental-photo-view-v1"

export const VISION_CLASSIFICATION_PROMPT = `You are a strict image-view classifier for orthodontic and dental clinical photographs.

Your only task is to classify exactly one input image using the taxonomy
"dental-photo-view-v1". Do not diagnose conditions, identify diseases,
recommend treatment, infer patient identity, or describe clinical findings.

Use the patient's anatomical left/right, not the viewer's screen left/right.

Allowed labels:
- intraoral_frontal: intraoral frontal occlusion view
- intraoral_right_buccal: intraoral right buccal occlusion view, patient's right
- intraoral_left_buccal: intraoral left buccal occlusion view, patient's left
- intraoral_maxillary_occlusal: maxillary dental arch occlusal view
- intraoral_mandibular_occlusal: mandibular dental arch occlusal view
- extraoral_frontal_relaxed: extraoral frontal face with a relaxed expression
- extraoral_frontal_smile: extraoral frontal face with a smile
- extraoral_right_profile: extraoral right profile, patient's right
- extraoral_left_profile: extraoral left profile, patient's left
- other: a clear dental or orthodontic-related photograph that does not fit any
  standard view above
- unknown: abstain when a specific taxonomy class cannot be determined reliably

Decision rules:
1. Return unknown rather than guessing whenever a specific taxonomy class is
   not reliable. Do not use a fixed numeric confidence threshold for abstention.
2. Return other only when the image is sufficiently clear and visibly does not
   fit any standard taxonomy label.
3. Confidence is your self-assessed confidence in the final output. For unknown,
   it is confidence that abstention is appropriate.
4. Return exactly one JSON object with exactly these three required fields:
   taxonomy_version, view_prediction, confidence.
5. taxonomy_version must be "dental-photo-view-v1". view_prediction must be
   one allowed label. Do not return label. Do not omit taxonomy_version. Do not
   add any other field.
6. Do not output a diagnosis, rationale, explanation, Markdown, or text outside
   the JSON object.

Return exactly this JSON object shape:
{
  "taxonomy_version": "dental-photo-view-v1",
  "view_prediction": "<one allowed label>",
  "confidence": 0.98
}`

export const VISION_CLASSIFICATION_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "vision_classification_v1",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        taxonomy_version: {
          type: "string",
          const: VISION_TAXONOMY_VERSION,
        },
        view_prediction: {
          type: "string",
          enum: [
            "intraoral_frontal",
            "intraoral_right_buccal",
            "intraoral_left_buccal",
            "intraoral_maxillary_occlusal",
            "intraoral_mandibular_occlusal",
            "extraoral_frontal_relaxed",
            "extraoral_frontal_smile",
            "extraoral_right_profile",
            "extraoral_left_profile",
            "other",
            "unknown",
          ],
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
      },
      required: ["taxonomy_version", "view_prediction", "confidence"],
    },
  },
}

export const VisionClassificationSchema = z
  .object({
    taxonomy_version: z.literal(VISION_TAXONOMY_VERSION),
    view_prediction: z.enum([
      "intraoral_frontal",
      "intraoral_right_buccal",
      "intraoral_left_buccal",
      "intraoral_maxillary_occlusal",
      "intraoral_mandibular_occlusal",
      "extraoral_frontal_relaxed",
      "extraoral_frontal_smile",
      "extraoral_right_profile",
      "extraoral_left_profile",
      "other",
      "unknown",
    ]),
    confidence: z
      .number()
      .finite()
      .min(0)
      .max(1)
      .refine((value) => Number(value.toFixed(2)) === value),
  })
  .strict()

export type VisionClassification = z.infer<typeof VisionClassificationSchema>
