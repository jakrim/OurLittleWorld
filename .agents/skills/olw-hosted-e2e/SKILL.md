---
name: olw-hosted-e2e
description: Run an evidence-backed Our Little World mobile audit on the isolated hosted QA backend when Docker or local Supabase is unavailable. Use for Devin or another remote agent testing auth sessions, real image Keep, RLS, storage, Today, Tonight, Our World, corrections, and privacy boundaries with synthetic data.
---

# Our Little World hosted end-to-end QA

Read `AGENTS.md`, `docs/product-contract.md`, `docs/smoke-testing.md`, and
`docs/hosted-qa-runbook.md` before acting.

1. Inventory the exact checkout, branch, dirty paths, simulator, build, backend
   target, and provider configuration. Never infer them from an earlier run.
2. Accept only localhost or the exact non-production project ref supplied through
   the encrypted QA profile. Stop if it equals production or the database identity
   does not match.
3. Use synthetic accounts and synthetic media. Never use, copy, upload, log, or
   screenshot real family media, face data, local asset IDs, embeddings, OTPs, or
   provider secrets.
4. Run deterministic tests first. Bootstrap/seed the hosted backend only when its
   migration receipt is incomplete; do not replay provider migrations or reset a
   remote database.
5. Build the exact source runtime. Exercise one continuous parent journey through
   real Supabase auth/session, RLS, storage, and canonical Keep boundaries. A
   render-only fixture or `dev-login` is not proof of the behavior it bypasses.
6. Capture screenshots at major transitions and verify the corresponding database
   rows without recording identifiers. Keep evidence private and aggregate-only.
7. Classify native Photos/face orientation, StoreKit, push, Stream, microphone,
   backgrounding, and physical-device behavior as separate gates unless actually
   exercised.
8. Report source, build, backend, simulator, provider, and physical proof levels
   separately. Do not call a feature passed because its source exists or its mock
   rendered.
