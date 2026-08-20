# DentCase Flow — Current State

Last synchronized: 2026-08-20

## Pre-deployment Security Hardening Checkpoint

- P0 anonymous model invocation has been fixed.
- P1 API authentication and ownership checks have been fixed.
- `npm run build` passes.
- Still pending: runtime regression, persistent rate limits, full database RLS/Grants audit, two-account acceptance testing, and deployment.
- Manually applied RLS changes still need to be consolidated into reproducible migrations.

## Phase Status

### Phase 0 — ACCEPTED / FROZEN

Accepted on 2026-08-10:

- daily sequential `CASE-YYYYMMDD-NNN` code generation through `public.create_case` and `private.case_daily_counters`
- case creation, title persistence, and case detail navigation
- batch image upload, gallery refresh, and single-image deletion
- case deletion with Storage object, `case_images`, and `cases` cleanup

Case codes are not reused after deletion. Do not modify the RPC, daily counter table, or code-generation rule.

### Phase 1 — Frozen

The live database is confirmed to include:

- `cases.case_type`, `cases.patient_name`, `cases.patient_phone`, and `cases.birth_year`
- `case_timepoints`
- nullable `case_images.timepoint_id`
- `image_predictions`
- `image_reviews`

Existing Phase 0 cases and images are preserved. Historical patient/timepoint fields may be null.

The repository contains versioned migration drafts for `patient_name`, `patient_phone`, and `birth_year`. The foundational Phase 1 schema migration is confirmed in the live database but is not represented by a checked-in migration file.

The accepted Phase 1 workflow is:

```text
总病历库
→ 治疗类型病例库
→ 患者治疗档案
```

`case_type` remains an English PostgreSQL identifier (`orthodontics` or `anterior_aesthetics`). All user-visible UI uses the shared Chinese mapping instead.

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

Production photo workflow: a doctor selects a category, uploads one or more
photos, completes the upload batch, and sees the completed batches as an
ascending timepoint timeline. A draft timepoint is created lazily on the first
successful upload and is completed only when the doctor clicks “本次上传完成”.


## Phase 2.2 — Photo Organization

**Status: Completed**

**Manual verification: PASS**

Current production workflow:

```text
Doctor selects category
→ uploads one or more photos
→ completes the current upload batch
→ completed batches form an ascending timepoint timeline
→ doctor may edit a historical batch later
```

Production behavior:

- Doctors independently choose a photo category and upload one or more photos per category.
- Each completed upload batch forms an independent `case_timepoint`.
- Face, intraoral, and other photos use fixed groups and a frozen category order.
- Uploaded photos are automatically organized by that order; unuploaded categories and empty groups are not rendered.
- Historical batches support edit, supplemental upload, and deletion.
- Missing-view reminders and completeness assessment are not implemented.
- Vision AI is not used in this workflow.

Frozen display order:

```text
面部
1. 正面照（放松）
2. 正面照（微笑）
3. 右侧貌照
4. 左侧貌照

口内
1. 正面咬合像
2. 右侧侧位咬合像
3. 左侧侧位咬合像
4. 上颌牙弓合面像
5. 下颌牙弓合面像

其他
1. 其他
```

Final data semantics:

- `case_timepoints` is an upload batch.
- `completed_at IS NULL` is a draft; `completed_at IS NOT NULL` is a completed batch.
- `sequence_order` is the upload-batch order within one case.
- `case_images.timepoint_id` identifies an image's batch.
- `image_reviews.view_label` is the doctor's final photo category.
- `reviewed_prediction_id = null` means manual-only and is not an AI Eval sample.
- The production upload workflow makes no Qwen call and creates no `image_predictions`.

Engineering notes: this rollout required deploying the `completed_at` migration,
adding `case_timepoints` MVP CRUD/SELECT RLS policies, writing the required
`sequence_order` for draft creation, and updating `image_reviews_state_check`
for manual-only reviewed labels.

Vision Classification: historical experiment only; it is not part of the
current production photo workflow.

Missing-view reminder: not implemented by product decision. Doctors decide
which photos are valuable for the current case and treatment stage.

## Pending

- UI Polish (deferred for a unified future pass; it does not affect Phase 2.2 PASS)
- patients table or `patient_id`

## Phase 2.1.1 — Mock AI Prediction + Human Review Workflow

Phase 2.1.1 — Completed

Manual workflow verification:
Case A-E PASS

- after a successful `case_images` insert, the client creates one deterministic `mock-v1` prediction when the same image has no `mock-v1` / `dental-photo-view-v1` record
- the Gallery reads persisted Mock Prediction and Human Review records separately, and presents Chinese taxonomy labels
- doctors can confirm the AI label, modify it from the fixed taxonomy, or self-classify when AI returns `unknown`; reviews are upserted by `image_id` and never overwrite the prediction
- Mock Prediction exists only to verify the AI workflow. It does not represent real AI classification ability or accuracy.
- AI Prediction and Human Review remain separate records.
- Human Review paths:
  - AI correct → doctor confirms
  - AI incorrect → doctor changes the classification
  - AI unable to determine → doctor self-classifies
- Phase 2.1 MVP anon RLS policies are complete.
- Storage object keys now use safe generated filenames.
- Photo taxonomy Chinese terminology has been corrected.

## Phase 2.1.2 鈥?Minimal Eval + Badcase

Completed

Manual verification: Case A-F PASS

- `/eval` derives its samples at request time from `image_reviews`, `image_predictions`, and `case_images`.
- It evaluates only `reviewed` reviews with a non-null human label and the exact fixed-version prediction referenced by `reviewed_prediction_id`.
- It shows reviewed sample count, Overall Accuracy, Human Correction Rate, Abstention Rate, per-ground-truth-class statistics, and a derived Badcase list.
- It does not create eval/badcase tables or write derived results back to predictions or reviews.

## Phase 2.2.1 鈥?Vision Classification Contract + Prompt v1

Completed

- The real Vision classification input, `dental-photo-view-v1` taxonomy,
  structured JSON output, `unknown` abstention behavior, confidence semantics,
  and Prompt v1 are frozen in `docs/VISION_CLASSIFICATION_CONTRACT_V1.md`.
- `unknown` means the model cannot reliably determine a specific taxonomy class;
  there is no fixed numeric abstention threshold.
- `confidence` is the model's self-assessed confidence in its final output.
- Any formal Prompt, model, model-setting, or classification-policy change that
  can affect behavior must use a new `predictor_version`.

## Phase 2.2.2 鈥?Real Vision API Integration

In progress

- `vision-v1` is the first real baseline and uses Alibaba Cloud Model Studio /
  Qwen `qwen3.7-plus`; the earlier OpenAI integration created no formal real
  prediction or Eval data because API billing was unavailable.
- The server-side integration uses the existing publishable key and anon RLS; a
  `SUPABASE_SERVICE_ROLE_KEY` is not introduced.

## Frozen vision-v1 baseline

The first real `vision-v1` regression baseline is frozen and must not be
overwritten. It uses `qwen3.7-plus`, `dental-photo-view-v1`, and ten reviewed
development/regression images (not an independent generalization test set).

```text
Accuracy:       6/10 = 60%
Side badcases:  0/4 correct (left/right side-buccal)
Mean latency:   7.41 s
Median latency: 6.05 s
```

Root cause record: a single side-buccal image can lack enough information to
reliably determine the patient's anatomical left/right. The isolated side-task
experiment also did not meet product reliability or latency requirements.

`vision-v2` changes only the abstention policy: when a side-buccal image's
anatomical side cannot be reliably determined from that single image, it must
return `unknown` rather than guess. Model, thinking configuration, taxonomy,
and image processing remain unchanged for the v1/v2 regression comparison.

## Vision Classification Product Gate

Decision: synchronous/blocking AI classification is downgraded.

Reason: the Vision Classification experiments showed a latency long-tail and a
quality trade-off that do not meet the clinical workflow requirement. The
frozen `vision-v2` thinking-null development/regression baseline is 60%
accuracy, 1 misclassification, 30% abstention rate, 85.7% selective accuracy,
8.47 s mean latency, and 7.53 s median latency. The `enable_thinking=false`
offline experiment is frozen but **not adopted** as production configuration:
it remained 60% accurate, increased misclassification to 2, reduced selective
accuracy to 75%, had 12.13 s mean latency, 3/10 requests above 10 s, and a
41.94 s maximum.

Current product strategy: manual-first classification. A doctor selects the
photo category at upload time. AI is not part of the doctor-facing production
workflow. A review with `reviewed_prediction_id = null` is a human ground truth
record, not an AI Eval sample.

## Vision Classification Product Decision

AI photo-view classification has been removed from the production case-upload
workflow. Doctors select the photo category at upload time; each image is
written with a manual `image_reviews.view_label` and a null
`reviewed_prediction_id`. AI Vision experiments, Eval, Badcase, contracts,
classifiers, inference-run records, and historical predictions are retained as
historical experiment evidence only, not as part of the doctor-facing workflow.

## Next Step

### Phase 3.1A — Voice ASR Eval

Phase 3.1A — ASR Eval Completed. Product Gate pending manual review. The
Aliyun `qwen-audio-3.0-asr-flash` baseline and fixed-v1 hotword runs each
completed all ten Chinese orthodontic recordings. This is an isolated,
reproducible ASR evaluation harness and does not change the production photo
workflow, Vision experiments, database schema, or UI.

The planned provider baseline is Alibaba Cloud Model Studio
`qwen-audio-3.0-asr-flash`, evaluated in `baseline` and medium-weight
instant-hotword modes. Raw audio and any conversion cache are Git-ignored;
ground truth, manifest, scripts, and generated evaluation results are
versionable.

UI Polish remains pending. Do not reintroduce Vision classification into the
production photo workflow without a new product decision.

### Phase 3.1B — Structured Case Extraction Eval

Phase 3.1B — Structured Extraction Eval Completed. Product Gate pending
manual review. The strict-schema `qwen3.7-plus-2026-05-26` baseline completed
ten clean-transcript and ten baseline-ASR-transcript structured extraction
requests, with JSON parse and local schema validation passing for all saved
predictions. The manual review artifact is ready. This isolated eval harness
does not call ASR, modify the production workflow, database schema, UI, or
historical Vision experiments.

### Phase 3.1B v2 — Badcase-driven Iteration

Badcase smoke test completed for cases 02, 05, 06, and 09 in both clean and
ASR-transcript paths. Strict schema validity remained 8/8, and Chinese output
and treatment-action classification improved in several samples. Iteration is
still required: case_02 retained an unsupported follow-up plan and ASR-path
patient-feedback confusion; case_06 ASR path still inferred `visit_type`.
The full 10+10 v2 run was not started. Product Gate remains pending manual
review.

### Phase 3.1B — Candidate Extraction v1

Phase 3.1B — Candidate Extraction v1 Full Eval Completed. Product Gate
pending manual candidate review.

- The frozen `qwen3.7-plus-2026-05-26` model, `candidate_extraction_v1`
  prompt, and strict candidate-fact schema completed all ten clean-transcript
  and ten saved baseline-ASR-transcript requests.
- Each candidate retains its model-produced `category`, `content`, and
  `evidence_quote`. A deterministic exact-substring validator records
  `evidence_valid`; it does not repair, remove, or use Ground Truth to alter
  model output.
- Full candidate-level and case-level review CSVs are available under
  `data/eval/voice_v1/candidate_extraction_v1/review/`. Human scoring fields
  are intentionally blank pending review; candidate recall is not auto-scored
  because equivalent natural-language wording requires human judgment.
- Future production workflow rule: a candidate with `evidence_valid=false`
  must not automatically enter Confirmed Facts. The future doctor review UI
  must hide it or clearly mark it as original-text evidence unverified.
- ASR propagation is preserved as an evaluation concern: case_02 may lose
  `右上` to `上颌`, and case_09 may lose `左下` to `左侧`; Candidate Extraction
  must not restore omitted entities.

### Phase 3.1C — Voice Review UI

Phase 3.1C — Voice Review UI implemented. Manual workflow verification pending.

- The case detail page provides browser recording, server-side ASR, Candidate
  extraction with evidence validation, and doctor keep/edit/delete controls.
- Transcript, candidates, edits, and Confirmed Facts are current-page state
  only. No Supabase writes or final structured-case generation are performed.
- Candidates with unverified evidence default to unselected and are visibly
  warned. The reviewed candidate contract remains frozen from Phase 3.1B.

### Phase 3.1C.1 — Inline Voice Review & Persistence

Phase 3.1C.1 — Inline Voice Review & Persistence implemented. Manual workflow
verification pending.

- Candidate content is the normalized, selectable fact; raw transcript remains
  evidence/audit information and cannot enter confirmed segments directly.
- Confirmed facts are bound to a completed `case_timepoint` through the new
  `case_voice_notes` persistence contract. Multiple notes per timepoint are
  allowed and are displayed chronologically with whole-note deletion.
- The new migration follows the current MVP anon RLS style. Before real
  multi-user deployment, Supabase Auth, case ownership, and ownership-based
  RLS remain required.

### Phase 3.1C.2 — Normalized Inline Voice Note

Phase 3.1C.2 — Normalized Inline Voice Note implemented. Manual workflow
verification pending.

- Raw transcript is retained internally only. `voice_review_normalization_v1`
  provides doctor-facing normalized text and selectable inline segments.
- A segment is selectable only when both its raw evidence and normalized-text
  substring validations pass; only selected normalized segments persist.
- Each note is bound to the exact `case_timepoints.id` for its photo batch,
  verified server-side before insert, and reloads into that same card.
- Normalization policy: semantic-preserving normalization is allowed; clinical
  fact expansion is prohibited. Doctors may manually edit selected normalized
  segments before confirmation.

### Phase 3.1C.3 — Voice Note Final Interaction

Phase 3.1C.3 — Voice Note Final Interaction implemented. Manual verification
pending.

- Empty confirmation creates no `case_voice_notes` row; clearing every item
  from an edited record deletes the row.
- One active note is maintained per timepoint in the service API. Later voice
  confirmations append exact-content-deduplicated segments and retain each raw
  transcript in the audit text.
- Doctors may edit, delete, or manually add confirmed case content without an
  ASR or LLM call. Manual content records `source: doctor_manual`.

### Phase 3.1C.4 — Voice Note Interaction Polish

Phase 3.1C.4 — Voice Note Interaction Polish implemented. Manual verification
G-I pending.

- First and append recordings share one recorder state machine with explicit
  recording, stop, transcription, normalization, review, and saving feedback.
- Inline normalized facts remain selectable and editable before confirmation;
  confirmation persists `edited_content` without another model call.
- Saved-note editing creates a separate manual segment on Enter and filters
  empty entries before persistence.

### Phase 3.1C — Current Stable Product Baseline

Phase 3.1C — Voice Case Note Completed and restored as current stable product
baseline. The validated photo workflow continues to create a draft batch on
first upload, complete it with `本次上传完成`, and always render the next `本次病例照片`
upload area. Voice recording, normalization, inline review, persistence,
editing, deletion, and same-timepoint note merging remain unchanged.

### Phase 3 — AI Workflow Completed / Frozen

Phase 3 AI Workflow is Completed / Frozen. Voice Case Note, Case Summary
Runtime, Contract Gate, Semantic Golden Case, Summary Freshness, Treatment Date
Editing, and Summary Reuse are accepted as the current stable baseline.

Case Summary uses `qwen3.7-plus-2026-05-26` with default thinking. The Runtime
Input Contract, Prompt, Schema, Contract Gate, validator, and freshness
fingerprint are frozen. Only Contract-PASS summaries persist; fingerprint reuse
avoids Qwen calls when the AI-relevant confirmed input is unchanged, including
when only `captured_on` changes.

Regenerate latency remains provider-dominated and is accepted for MVP; loading
feedback and freshness reuse are the selected mitigations. See
[`phase3_summary_eval.md`](phase3_summary_eval.md) for the frozen evaluation and
product decisions.

## Phase 4 — PPT Generator

**Phase 4 — PPT Generator — Frozen**

PPT Generator Contract v1 and Selection Workflow v1 are Frozen. PPT MVP is
complete; stop adding core capabilities unless real user feedback proves a new
requirement is necessary.

Final verified MVP capabilities:

- `academic_discussion` / 学术交流 and `case_showcase` / 病例展示;
- doctor-selected Case Summary entries, completed timepoints, and images;
- up to 3 timepoints, 6 images per timepoint, and 10 images total;
- orthodontic intraoral `intraoral_standard_3` and
  `intraoral_standard_5`, matched independently per timepoint;
- deterministic, rule-based single-slide PPTX layout and browser download;
- no AI clinical advice or AI automatic image selection.

The code also includes an anterior-aesthetics Case Showcase comparison rule:
2 timepoints × 1 `intraoral_frontal` image per timepoint, sorted by
`sequence_order` as treatment-before / treatment-after. Its real PPT-file
manual visual acceptance is pending and is therefore not recorded as a final
verified capability.

PPT Selection UI runtime reconciliation fix — PASS:

- `PhotoOption` dynamic text nodes are consolidated;
- timepoint/photo keys are stable and selection state uses immutable updates;
- timepoint select/remove, rapid photo toggling, and PPT type switching passed
  regression checks.

PPT Renderer Visual Polish v2

Status: Implementation complete; manual visual verification pending.

Known pending verification (does not reopen the frozen Phase 4 scope):

`intraoral_standard_5` is implemented and passed code-level/regression logic
verification. A real eligible standard-five-image timepoint is now available,
but its PowerPoint manual-open acceptance is not yet recorded as PASS. This
does not block the Phase 4 MVP freeze.

Next: Productization → Final UI polish → Documentation / architecture
understanding → Resume → Interview preparation.

## Deferred Technical Debt

- historical `case_images` FK design
- non-transactional Storage/database deletion compensation
- file-size/type restrictions
- raw `<img>` LCP warning
- Timepoint concurrent sequence allocation
- complete migration automation and checked-in foundational Phase 1 migration
- future patients master-data model

## Production Readiness Freeze — 2026-08-20

Status: **Production readiness checks completed; deployment pending**.

Phase 0, Phase 1, Phase 2, Phase 3, and Phase 4 product functionality is
frozen for deployment. No new product capability is included in this freeze.

### Persistent daily API limits — PASS

The account-level UTC daily limits are persisted in Supabase and enforced by
the authenticated RPC before high-cost provider work:

| Operation | Daily limit |
|---|---:|
| `voice_transcribe` | 50 |
| `voice_extract_candidates` | 100 |
| `case_summary` | 30 |
| `case_ppt` | 50 |

Case Summary cache hits reuse the stored result without quota consumption or a
provider call. Cache misses consume quota before provider work.

### Database and Storage hardening — PASS

- All business tables have RLS enabled.
- Ownership policies are limited to authenticated users and constrain access
  through `cases.owner_id = auth.uid()`.
- Anonymous business-table permissions are revoked.
- Authenticated table grants are minimized; TRUNCATE, TRIGGER, and REFERENCES
  are revoked.
- `case-images` is private.
- The quota table and RPC use the reproducible migrations under
  `supabase/migrations`.

### Isolation acceptance — PASS

Two-account database, page, summary, PPT, voice, and Storage ownership tests
passed. Anonymous page and API access tests passed with the expected denial
responses.

### Deployment compatibility — PASS

- Voice candidate extraction Prompt and Schema are bundled in a server-only
  TypeScript resource module; production code no longer reads ignored
  `data/eval` files.
- Summary and PPT routes explicitly use the Node.js runtime and
  `maxDuration = 200`.
- PPT responses over 4 MiB return HTTP 413 with the fixed user-facing error;
  responses at or below the limit retain the normal download behavior.
- A two-timepoint, five-photo runtime PPT measured 802 KB and downloaded
  successfully.

The remaining deferred items above are non-blocking follow-up work and do not
reopen the frozen Phase 0–4 scope.
