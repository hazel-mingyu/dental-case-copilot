# DentCase Flow

## Product Positioning

DentCase Flow is an AI-assisted dental case workflow tool for primary and small/medium dental practices. It is not an AI diagnostic product.

In the current MVP, a case is a patient's long-term treatment record for one treatment type. The intended hierarchy is:

```text
Patient (future entity)
  → Case
    → Timepoint
      → Image
```

The MVP does not yet create a `patients` table. A `cases` row currently carries the patient-facing fields required for its treatment record.

## Current Product Workflow

```text
Total case library
  → treatment-type case library
    → patient treatment record
      → treatment photos
```

1. `/` is the total case library and only offers treatment-type selection.
2. `/cases?case_type=orthodontics` and `/cases?case_type=anterior_aesthetics` show the selected treatment-type library, patient search, and the new-case entry point.
3. `/cases/[id]` is the patient treatment record with patient information, images, and upload/delete controls.

New case creation goes directly to `/cases/[id]`. The treatment record returns to its own type library.

## Case Semantics

`case_code` remains a system-generated, immutable workflow identifier in the format:

```text
CASE-YYYYMMDD-NNN
```

`public.create_case` and `private.case_daily_counters` generate it. Deleted case codes are not reused; this is expected behavior.

Current `cases` semantics:

- `patient_name`: primary treatment-record display name.
- `patient_phone`: search and same-name disambiguation aid.
- `birth_year`: optional year of birth. UI calculates current age; age is not stored.
- `case_type`: `orthodontics` or `anterior_aesthetics` in PostgreSQL.
- `title`: retained for backward compatibility and possible future note/PPT-title use. The current new-case UI does not ask for it; current implementation passes `patient_name` to `create_case` as `p_title`.

Database values remain English identifiers. UI must map them to Chinese:

```text
orthodontics         → 正畸
anterior_aesthetics  → 前牙美学修复
```

## Human–AI Boundary

AI may organize, classify, summarize, and draft content. Doctors confirm or correct outputs and make final decisions.

AI must not provide diagnosis, treatment recommendations, or stage predictions.

## Phase 1 Data Direction

The live database has the following Phase 1 entities:

```text
cases
case_timepoints
case_images
image_predictions
image_reviews
```

`case_timepoints` represents a treatment-process photography batch. Allowed stages are:

```text
baseline, progress, final, follow_up, unknown
```

`case_images.timepoint_id` is nullable for historical Phase 0 images.

`image_predictions` stores append-only AI prediction history. `image_reviews` stores one current human review per image. AI prediction and human-confirmed label must remain separate.

## Orthodontic View Taxonomy v1

AI v1 is planned only for orthodontic image view classification:

```text
intraoral_frontal
intraoral_left_buccal
intraoral_right_buccal
intraoral_maxillary_occlusal
intraoral_mandibular_occlusal
extraoral_frontal_relaxed
extraoral_frontal_smile
extraoral_left_profile
extraoral_right_profile
unknown
other
```

Anterior aesthetics does not use AI classification in the current scope.

## Next Phase

Phase 2 is **AI Photo Structuring + Human Review**:

```text
Orthodontic image
  → AI view prediction
    → doctor review
      → confirm/correct
        → preserve prediction + human label
          → evaluation and bad-case analysis
```

Before connecting a Vision API, inspect `image_predictions` and `image_reviews` against a manual-prediction and human-review UI flow.

## Explicit Non-Goals

Do not add without an explicit request:

- `patients` table, `patient_id`, gender, address, ID card, medical history, or HIS features
- AI diagnosis, treatment advice, agent/multi-agent architecture, payments, complex permissions, or custom model training
- production auth/RLS/private storage work while it does not block the active workflow

## Architecture Direction

The MVP uses Next.js, Supabase PostgreSQL, and Supabase Storage. Supabase remains the MVP backend. Current anon permissions and public Storage are MVP-only and are not production-safe for real medical deployment.
