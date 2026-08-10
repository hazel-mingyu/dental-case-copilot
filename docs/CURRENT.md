# DentCase Flow — Current State

Last verified: 2026-08-10

## Repository Evidence

The working tree contains uncommitted Phase 0 implementation work. Source code currently provides:

- A force-dynamic case library that reads `cases` ordered by `created_at` descending, links to create/detail pages, and offers case deletion.
- A create-case client form that calls the `create_case` Supabase RPC with an optional trimmed title, then navigates to the returned case.
- A case-detail page that reads a case and its `case_images`, derives public URLs from the `case-images` bucket, and renders title editing, gallery, and upload controls.
- Title update via `cases.update`; multi-file sequential upload to Storage then `case_images.insert`; image deletion from Storage then `case_images`; case deletion by querying paths, removing Storage objects, deleting related image rows, then deleting the case.
- A Supabase browser client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Current Phase

Phase 0 — ACCEPTED / FROZEN

Acceptance date: 2026-08-10

Manual end-to-end acceptance passed for:

- creating a case
- daily incremental case codes in the `CASE-YYYYMMDD-NNN` format
- editing a case title
- batch image upload
- image persistence after page refresh
- deleting one image
- synchronized deletion from Storage and `case_images`
- deleting an entire case
- three-level deletion from Storage, `case_images`, and `cases`

Do not continue CRUD polish unless it blocks Phase 1. The next product phase is Photo Structuring and Human Review. Do not connect a Vision model or create a migration until its contract is explicitly approved.

## What Is Not Verifiable From This Repository

There is no checked-in `supabase/` directory, migration, schema definition, RLS policy, bucket definition, or deployment configuration. Therefore the existence and exact definitions of the following cannot be verified locally:

- `cases` and `case_images` tables, their fields, foreign keys, or cascade behavior
- `create_case` implementation and its daily sequential `CASE-YYYYMMDD-NNN` behavior
- `case-images` bucket, its public/private state, and anon RLS policies
- end-to-end persistence, refresh, deletion, and storage/database recovery behavior

The configuration definitions remain unversioned and cannot be inspected from this repository. Their Phase 0 runtime behavior was manually accepted on 2026-08-10.

## Phase 1 Design Gate

Propose the minimum data contract and acceptance criteria first. It must specify:

1. Meaning and allowed values for `stage` and `view`, including unclassified/unknown states.
2. What AI predicts and what the doctor can edit.
3. Separate preservation of AI prediction data and doctor-confirmed ground truth.
4. Review-status representation.
5. Data needed now for later evaluation and bad-case analysis versus deferred extensions.

For every proposed field, explain its workflow role and migration impact. Do not implement the migration without approval.

## Known Technical Constraints

- Storage and database operations are separate. The current upload flow compensates by removing an uploaded object if image-row insertion fails; deletes run Storage first, then database rows, so partial failures remain possible.
- The gallery receives server-derived data and refreshes after mutations; it does not duplicate the image list in local state.
- Public URLs are used by the current detail page. Authentication, ownership, private Storage, signed URLs, production RLS, robust cross-resource compensation, upload concurrency/performance, and UI polish are deferred.

This technical debt does not block Phase 1 and is intentionally deferred.

## Phase 1 Schema Migration

Status:
COMPLETED

Added:
- cases.case_type
- case_timepoints
- case_images.timepoint_id
- image_predictions
- image_reviews

Verified:
- Existing cases preserved
- Existing images preserved
- create_case RPC unchanged
- RLS enabled on new tables