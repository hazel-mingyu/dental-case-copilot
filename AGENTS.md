<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DentCase Flow — Agent Instructions

## Product

DentCase Flow is an AI-assisted dental case workflow product for primary and small/medium dental practices. It is not an AI diagnosis system.

Core workflow: case photos → structured case assets → AI-assisted organization → doctor review/correction → reusable case content → PPT generation.

AI provides recommendations and organization. Doctors make final decisions.

## Current Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Supabase JavaScript client (PostgreSQL, Storage, API)
- Planned deployment: Vercel

## Working Rules

Before changing code:

1. Read `docs/PRODUCT.md` and `docs/CURRENT.md`.
2. Inspect the relevant existing code.
3. Do not assume documentation is more current than the repository.
4. State the intended change before a substantial multi-file modification.

Priorities: correct workflow, data correctness, verifiable behavior, simple maintainable implementation, then UI polish. Prefer the smallest MVP implementation; do not add speculative abstractions.

## Product Constraints

Do not introduce without an explicit request:

- AI diagnosis, agent/multi-agent architecture, HIS, payments, complex permissions, custom model training
- Supabase replacement, unrelated features, or infrastructure/framework migration

## AI Product Principle

The intended loop is: AI prediction → human review → human correction → store prediction and human label → evaluation/bad-case analysis → iteration.

AI output must remain reviewable and correctable by the doctor.

## Engineering Rules

- Preserve working CRUD and Storage workflows; avoid unrelated refactors.
- Do not silently change database schemas. Explain the workflow need, migration impact, and PostgreSQL/Storage consistency before any schema change.
- Do not assume UI success proves persistence succeeded. Keep a clear source of truth where possible.
- Treat the current public Storage and anon RLS posture as MVP-only, not production-safe; do not expose medical data insecurely.

## Implementation Workflow

For each feature: define goal, scope and non-goals; inspect code; propose the smallest implementation; implement; run available checks; report changed files and manual acceptance steps; record material progress in `docs/CURRENT.md`.

Do not mark a feature complete merely because it compiles. Where applicable verify UI, PostgreSQL persistence, Storage persistence/deletion, refresh behavior, and relevant error paths. Diagnose from actual logs/errors rather than guessing.

## Communication

The project owner is learning full-stack product development. When introducing a new engineering concept, briefly explain what it does and why it is needed here. Do not over-explain basics unless requested.
