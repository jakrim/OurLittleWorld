# Our Little World agent guide

## Product and trust contract

Our Little World is a private family space for parents to keep photos, videos,
notes, voice, Firsts, and letters. Parents are the authority. Never fabricate a
memory, date, milestone, family relationship, feeling, child identity, or child
intent. Assistance may surface candidates and grounded prompts; only an
authorized parent decides what becomes a shared memory.

Read [`docs/product-contract.md`](docs/product-contract.md) for durable product
and privacy rules. Use [`docs/architecture.md`](docs/architecture.md) for system
design, the active PRD for intended work, and `docs/sprint-progress.md` only for
temporary execution state. Dependencies, routes, migrations, builds, branches,
provider state, and file inventories must be discovered from source and tools.

## Repository and worktree ownership

This directory is the canonical monorepo. `apps/mobile` owns the native family
experience, `apps/web` owns marketing/purchase/gift/support surfaces,
`supabase` owns schema and Edge Functions, and `workers/media-gateway` owns the
media gateway. Historical branches are reference only unless a task explicitly
targets them.

Before substantive work:

1. Run `pnpm agent:inventory` and record which checkout/worktree owns the task.
2. Inspect other worktrees for related work; do not implement a feature twice.
3. Preserve unrelated dirty changes. Read the owning manifest, source, schema,
   active PRD, and only the focused policy/runbook needed.
4. If stale work is ambiguous, inventory or quarantine it. Prune a worktree only
   when it is clean, the branch is proven merged or preserved, and it contains no
   unique artifact. Never discard dirty work, unmerged commits, migrations,
   family exports, or user media because they look old.

Generated build output, expired previews, simulator screenshots, and reproducible
scratch fixtures may be removed when their provenance and replacement are clear.
Use non-destructive Git operations and retain cleanup evidence.

## Outcome loop

1. Define the parent journey and the empty, loading, offline, lapsed, permission,
   partial-write, retry, and two-caregiver states.
2. Identify each owner: mobile/web, database/RLS, Edge/Worker, types, analytics,
   copy, tests, and policy.
3. Implement the smallest coherent end-to-end change. Keep privacy boundaries,
   idempotency, contracts, migrations, analytics, and documentation synchronized.
4. Run narrow checks first, then broader checks proportional to risk.
5. Exercise the actual journey. User-facing work is not complete without
   `pnpm smoke:mobile` or a recorded equivalent using deterministic fixtures.
6. Check for fabricated facts, private data crossing Keep, family/role leakage,
   lapsed-write bypass, unsafe deletion/export, analytics content, missing error
   states, stale docs, and task-created artifacts.
7. Record a lesson only when it should change future behavior. Put current status
   and evidence in an active PRD or generated report, not durable guidance.

## Canonical commands

- Checkout/context: `pnpm agent:inventory`, `pnpm agent:validate`
- Primary family journey: `pnpm smoke:mobile`
- Repository: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`
- Mobile: `pnpm --filter @ourlittleworld/mobile test` and
  `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`
- Web: `pnpm --filter @ourlittleworld/web build`
- Database: `pnpm db:reset:migrations`
- Edge/Worker: run the applicable Deno/Worker checks in the owning package

The smoke runbook is [`docs/smoke-testing.md`](docs/smoke-testing.md). Use a
simulator/Expo inspection for one-off native debugging and Maestro for repeatable
flows. If a device or credential gate is unavailable, report the exact blocked
step after running deterministic non-UI checks; do not claim the UI was verified.

## Secrets, releases, and external actions

Secret files, signing material, provider keys, local family databases, generated
family/media exports, face/recognition evidence, and screenshots of private data
must stay outside source, logs, artifacts, docs, and chat. Existing authorized
profiles may be used for routine scoped verification or a requested testing
release. Verify identity, scopes, and variable names through the provider tool
without exposing values. On missing/expired access, report the failed command,
profile/provider, and recovery procedure instead of asking for a value already
stored elsewhere.

Use [`docs/release-runbook.md`](docs/release-runbook.md) for mobile, web,
Supabase, Worker, and database releases. A request for a testing release permits
upload to an already configured internal channel after gates pass. Production
deploys, public store submission/promotion, production OTA, destructive or
backward-incompatible database work, paid changes, domain/DNS changes, secret
rotation, public sharing, and privacy-scope expansion require explicit
action-specific authorization. Credentials are capability, not permission.

Repository-native docs may be Markdown. A separate document created for Jesse to
review should default to HTML. Run `pnpm agent:validate` and `git diff --check`
before handoff.
