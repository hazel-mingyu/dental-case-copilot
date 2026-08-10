# DentCase Flow — Current State

Last synchronized: 2026-08-10

## Phase Status

### Phase 0 — ACCEPTED / FROZEN

Accepted on 2026-08-10:

- daily sequential `CASE-YYYYMMDD-NNN` code generation through `public.create_case` and `private.case_daily_counters`
- case creation, title persistence, and case detail navigation
- batch image upload, gallery refresh, and single-image deletion
- case deletion with Storage object, `case_images`, and `cases` cleanup

Case codes are not reused after deletion. Do not modify the RPC, daily counter table, or code-generation rule.

### Phase 1 — Data Model Established

The live database is confirmed to include:

- `cases.case_type`, `cases.patient_name`, `cases.patient_phone`, and `cases.birth_year`
- `case_timepoints`
- nullable `case_images.timepoint_id`
- `image_predictions`
- `image_reviews`

Existing Phase 0 cases and images are preserved. Historical patient/timepoint fields may be null.

The repository contains versioned migration drafts for `patient_name`, `patient_phone`, and `birth_year`. The foundational Phase 1 schema migration is confirmed in the live database but is not represented by a checked-in migration file.

## Implemented Patient-oriented UI

Current source implementation provides:

- `/`: Chinese treatment-type entry points for 正畸 and 前牙美学修复.
- `/cases?case_type=...`: treatment-type library with patient-name/phone search, patient list, existing-case links, and new-case entry.
- `/cases/[id]`: patient treatment record with masked phone, birth year, dynamically calculated age, treatment type, first visit, latest visit fallback, image gallery, upload, and deletion controls.
- New case form: requires patient name; accepts optional phone and birth year; checks an existing case by `case_type + patient_name`; calls `create_case` with `p_title = patient_name`; then writes patient fields and navigates directly to `/cases/[id]`.
- UI-only case-type mapping in `lib/caseType.ts`; PostgreSQL values remain English identifiers.

`title` remains in PostgreSQL and `EditCaseTitle.tsx` remains in the repository, but the current patient treatment record UI no longer renders title editing.

## Current Timepoint Reality

The schema supports Timepoints, and list/detail pages read them when available to calculate the latest visit:

```text
max(captured_on)
→ max(timepoint.created_at)
→ cases.created_at
```

However, current `UploadImage.tsx` still uploads directly to Storage and inserts only `case_id` plus `image_path`. It does not yet create a Timepoint or write `case_images.timepoint_id`.

Therefore automatic baseline/progress Timepoint creation is not implemented. Do not describe it as complete until upload behavior is changed and accepted.

## Not Implemented

- automatic Timepoint creation per upload batch (`baseline` then `progress`)
- Timepoint grouping/editing UI
- AI prediction writer or Vision API integration
- human review UI, manual prediction UI, confirmation/correction UI
- evaluation queries, bad-case collection, metrics, or regression workflow
- patients table or `patient_id`

## Next Step

Phase 2 — AI Photo Structuring + Human Review

Before a Vision API is connected, inspect the live `image_predictions` and `image_reviews` schema against a manual-prediction and human-review UI. Confirm that prediction history, the reviewed prediction reference, and human labels support the intended evaluation loop.

## Deferred Technical Debt

- Supabase anon MVP permissions and production RLS
- public Storage, authentication, user isolation, private Storage, signed URLs, and medical-data compliance/deployment
- historical `case_images` FK design
- non-transactional Storage/database deletion compensation
- filename sanitization and file-size/type restrictions
- raw `<img>` LCP warning
- Timepoint concurrent sequence allocation
- complete migration automation and checked-in foundational Phase 1 migration
- future patients master-data model
