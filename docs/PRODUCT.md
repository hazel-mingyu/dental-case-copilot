# DentCase Flow

## Product Positioning

DentCase Flow is an AI-assisted dental case workflow tool for primary and small/medium dental practices. It turns raw case photos into structured, reviewable, reusable case assets; it is not an AI diagnostic product.

The target workflow is: case photos → structured case → AI organization → doctor confirmation → reusable case content → PPT.

## User Problem and Value

Case photos are commonly scattered across phones and folders. Selecting, organizing, describing, retrieving, reviewing, and laying them out for teaching or case sharing is repetitive manual work. DentCase Flow aims to reduce that work, especially for users with limited computer skills.

## Human–AI Boundary

AI may recommend classification, organize material, summarize, and draft content. The doctor confirms or corrects labels and makes the final content decision. No AI diagnosis is in scope.

## Product Roadmap

0. **Basic case workflow:** case library, creation, system case code, editable title, batch image upload/gallery, image deletion, and case deletion.
1. **Photo structuring:** define the minimum image representation (for example stage, view, sequence, review state) before a migration.
2. **AI vision baseline:** retain stage/view predictions sufficiently for evaluation.
3. **Human review:** preserve AI predictions separately from doctor-confirmed labels.
4. **Case organization** from reviewed images.
5. **Case summary** based primarily on doctor-reviewed information.
6. **Editable PPTX generation** from structured cases, reviewed photos, and summary.
7. **Evaluation/bad-case loop:** prediction, ground truth, metrics, failure categorization, iteration, and regression evaluation.
8. **Production hardening:** authentication, user isolation, private Storage, signed URLs, production RLS, compliant infrastructure, deployment, and user testing.

## Explicit V1 Non-Goals

- AI diagnosis; agent/multi-agent systems; HIS; payments; complex permissions; self-trained models; unnecessary enterprise architecture.

## Architecture Direction

The MVP uses Next.js and Supabase PostgreSQL/Storage. Supabase remains the MVP backend. Real-world mainland China medical use requires a separate infrastructure and compliance review; the MVP must not be treated as production-ready.

## Product Success

The meaningful proof is that a doctor can move from raw photos to organized, doctor-reviewed, presentation-ready material with substantially less manual organization work—not simply that many AI features exist.
