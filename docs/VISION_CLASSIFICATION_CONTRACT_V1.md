# Vision Classification Contract + Prompt v1

> Historical experiment record. This contract and its predictions are not part
> of the current doctor-facing production case-upload workflow.

## Status

Frozen for Phase 2.2.1.

This document defines the real Vision Model contract for orthodontic photo-view
classification. It does not authorize a Vision API integration, diagnosis,
treatment recommendations, or changes to the existing taxonomy.

## Versioning

```text
taxonomy_version  = dental-photo-view-v1
predictor_version = vision-v1
provider           = Alibaba Cloud Model Studio / Qwen
provider_model      = qwen3.7-plus
```

`predictor_version` is assigned by the application, never trusted from model
output. Any formal change that can affect model behavior must use a new
`predictor_version`, including a change to the Prompt, model, model settings,
or classification policy.

## Provider migration record

The initial OpenAI `gpt-5.4-mini-2026-03-17` integration did not produce a
formal real prediction or Eval baseline because OpenAI API billing was not
available. Before the first real baseline was established, `vision-v1` was
therefore reassigned to Alibaba Cloud Model Studio / Qwen `qwen3.7-plus`.

The DentCase taxonomy, Prompt semantic content, `unknown` policy, confidence
semantics, structured three-field contract, and predictor version remain
unchanged. This is a provider request-format migration, not Prompt v2.

After a real `vision-v1` prediction is stored, any provider, model, Prompt,
model-setting, or classification-policy change that can affect behavior must
use a new `predictor_version`.

## Input

Each request contains exactly one image from one `case_images` record.

Do not provide patient name, phone number, case code, prior predictions, human
reviews, diagnosis, treatment context, or other patient-identifying metadata.
The task is image-view classification only.

## Taxonomy

`view_prediction` must be exactly one of these existing
`dental-photo-view-v1` values:

```text
intraoral_frontal
intraoral_right_buccal
intraoral_left_buccal
intraoral_maxillary_occlusal
intraoral_mandibular_occlusal
extraoral_frontal_relaxed
extraoral_frontal_smile
extraoral_right_profile
extraoral_left_profile
other
unknown
```

Left/right means the patient's anatomical left/right, not the viewer's screen
left/right.

`other` means the image is sufficiently clear and is visibly a dental or
orthodontic-related photo, but does not fit a standard view above.

`unknown` is abstention. It means the model cannot reliably determine one
specific taxonomy class. The model must prefer `unknown` over guessing when the
image is unusable, ambiguous, has multiple independent images, lacks a clear
subject/view, or has indeterminate left/right. There is no fixed numeric
confidence threshold for abstention.

## Structured output

The model must return exactly one JSON object, with no Markdown, explanation,
or additional keys:

```json
{
  "taxonomy_version": "dental-photo-view-v1",
  "view_prediction": "intraoral_frontal",
  "confidence": 0.87
}
```

```ts
type VisionClassificationV1 = {
  taxonomy_version: "dental-photo-view-v1"
  view_prediction:
    | "intraoral_frontal"
    | "intraoral_right_buccal"
    | "intraoral_left_buccal"
    | "intraoral_maxillary_occlusal"
    | "intraoral_mandibular_occlusal"
    | "extraoral_frontal_relaxed"
    | "extraoral_frontal_smile"
    | "extraoral_right_profile"
    | "extraoral_left_profile"
    | "other"
    | "unknown"
  confidence: number
}
```

The integration must reject invalid JSON, an unknown taxonomy value, a wrong
taxonomy version, or an invalid confidence value. It must not insert an invalid
prediction row.

## Provider transport and validation

The Phase 2.2.2 provider adapter uses Alibaba Cloud Model Studio's OpenAI-
compatible Chat Completions API with `qwen3.7-plus`, one `image_url` input, and
JSON Schema mode. It sends a strict response schema with all three fields in
`required` and `additionalProperties: false`; therefore `label` is not an
accepted output field.

Provider JSON Schema mode constrains the response, but it does not replace the
application contract. The server parses the response and applies the strict
three-field schema above before inserting `image_predictions`; malformed JSON,
additional keys, invalid labels, taxonomy mismatch, and invalid confidence are
all rejected. The supplied image URL is the existing short-lived Supabase
Storage signed URL and is used directly as the provider image URL.

## Confidence

`confidence` is the model's self-assessed confidence in its final output.

```text
type: JSON number
range: 0.00 to 1.00 inclusive
precision: at most two decimal places
```

For `unknown`, it is the model's confidence that abstention is the appropriate
final output. It is not a clinical certainty, diagnosis, or treatment signal.
It can be used for ordering and later calibration analysis, but should not be
compared across different predictor versions.

## Persistence and evaluation compatibility

After validation, a future server-side integration writes the existing fields:

```text
image_predictions.image_id          = input image ID
image_predictions.view_prediction   = structured output view_prediction
image_predictions.confidence        = structured output confidence
image_predictions.taxonomy_version  = dental-photo-view-v1
image_predictions.predictor_version = application-owned predictor version
```

Predictions remain append-only. Doctors continue to review one prediction using
`image_reviews.reviewed_prediction_id`. Eval must use that exact reference, so
it evaluates the prediction the doctor actually reviewed.

Existing Eval behavior remains intentional:

```text
view_prediction = unknown
→ abstention badcase

view_prediction != unknown and view_prediction != view_label
→ misclassification badcase
```

## Prompt v1

```text
You are a strict image-view classifier for orthodontic and dental clinical photographs.

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
4. Do not output a diagnosis, rationale, explanation, extra keys, Markdown, or
   text outside the JSON object.

Return exactly this JSON schema:
{
  "taxonomy_version": "dental-photo-view-v1",
  "view_prediction": "<one allowed label>",
  "confidence": <number from 0.00 to 1.00 with at most two decimal places>
}
```
