# Agent Notes

## Project Context

- This is the modern Our Little World monorepo for a private, parent-approved baby book product.
- Work from `master` unless the user explicitly asks for another branch. The old `old_jessLaurApp` branch is historical reference only; do not reintroduce archive routes, static memory data, or generated simulator bundles on `master`.
- The app loop is: `Today` capture/review -> parent approval -> durable `Firsts`, `Letters`, `Library`, and baby-book payoff. Do not fabricate memories, dates, family relationships, or child milestones.
- Repo layout: `apps/mobile/` is Expo/React Native, `apps/web/` is the Next.js web app, `supabase/` holds migrations and Edge Functions, and `workers/media-gateway/` holds the Cloudflare media gateway.
- Treat `.env`, `.env.local`, Apple signing files, EAS credentials, Supabase service keys, and generated family/media exports as local secrets. Update examples only with placeholder values.
- Do not commit generated build outputs or large scratch assets. Keep `build/`, `dist/`, `ios/build/`, `android/build/`, `.expo/`, simulator screenshots, and seed-photo scratch files out of Git unless the user explicitly asks for a deliverable asset.

## Default Agent Loop

Use this loop for non-trivial work:

1. Inspect `git status --short --branch` and identify unrelated user changes before editing.
2. Read this file plus the smallest relevant docs, usually `docs/architecture.md`, active PRDs, `docs/sprint-progress.md`, and nearby source/tests.
3. State the scoped plan in the thread before broad edits.
4. Make the smallest coherent change and keep implementation, tests, and docs in sync.
5. Run the narrowest verifier first, then broader gates when shared behavior changed.
6. Do a checker pass before final response: look for regressions, missing tests, privacy leaks, generated files, and incomplete verification.
7. Report exact commands run, results, and any blocked verification.

Read `docs/current-product-state.md` before broad product, navigation, memory-model, privacy, subscription, media, or multi-phase work. Update it only when durable product state changes; continue to use `docs/sprint-progress.md` for execution status.

For trust-critical behavior, prefer executable policy checks over prose alone. When changing suggestions, memory creation, family access, analytics, deletion, export, subscription lapse, or photo-ingestion trust, add or update tests that prove the relevant boundary. Use deterministic fixture families for visual and flow verification across empty, new, active, and power-user states.

## State And Memory

- Use `docs/sprint-progress.md` as the durable work log when a task has multiple steps, blockers, or follow-up decisions.
- Record only non-secret facts: current goal, files touched, commands run, verification gaps, remote deploy state, tunables, and next action.
- If an agent makes the same wrong assumption twice, update this file or the closest project doc instead of relying on chat memory.

## Verification Gates

- Repo-wide gates: `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` when the change touches shared behavior.
- Mobile logic: `pnpm --filter @ourlittleworld/mobile test`.
- Mobile lint: `CI=true pnpm --filter @ourlittleworld/mobile exec expo lint`.
- Web changes: `pnpm --filter @ourlittleworld/web build`.
- Supabase migrations: `pnpm db:reset:migrations`.
- Edge Functions: `deno check supabase/functions/<function>/index.ts`; run `deno test` where tests exist.
- Repeatable mobile flows: `maestro test apps/mobile/.maestro/<flow>.yaml`.
- UI, navigation, routing, native module, or runtime-log claims require simulator, Expo MCP, Maestro, or browser verification when practical.

## Stop Conditions

Stop and ask before:

- Running production deploys, App Store submission, EAS submit/update, paid service changes, or destructive Supabase operations.
- Rotating or exposing secrets, touching Apple signing credentials, or changing bundle identifiers/project IDs.
- Marking a task complete when verifier gates fail, cannot run, or require unavailable credentials/dev-client access.
- Continuing a loop after repeated verifier failures without a new hypothesis.

## Expo MCP Policy

- Keep Expo's remote MCP server configured in Codex globally: `codex mcp add expo --url https://mcp.expo.dev/mcp`.
- Keep normal Metro startup stable and MCP-free. From the repo root use `pnpm dev:mobile`; from `apps/mobile` use `pnpm dev` or `pnpm start`.
- Agents should actively consider Expo MCP when debugging or building Expo features. Do not treat it as a last resort if it can shorten investigation or improve verification.
- Use remote Expo MCP for Expo docs, SDK behavior, dependency guidance, config/plugin questions, EAS/build/update workflow questions, and project-aware Expo help.
- Use local Expo MCP when the task benefits from interacting with the running app: screenshots, simulator taps, view or `testID` lookup, app logs, React Native DevTools, Expo Router sitemap inspection, route debugging, native UI verification, and post-fix visual checks.
- For local Expo MCP, confirm Expo auth with `pnpm --filter @ourlittleworld/mobile exec expo whoami || pnpm --filter @ourlittleworld/mobile exec expo login`, then run `pnpm dev:mobile:mcp` from the repo root or `pnpm start:mcp` from `apps/mobile`.
- After starting or stopping the local MCP-enabled Expo dev server, reconnect or restart the Expo MCP connection in the AI tool.
- Prefer Expo MCP for one-off native app inspection and debugging. Use Maestro for repeatable end-to-end flows, and CLI/simulator/browser alternatives when Expo MCP tools are unavailable or insufficient.
- Before claiming a UI, navigation, routing, native-module, or runtime-log issue is fixed, use local Expo MCP to verify it when the tools are exposed and the app can be run.
- If Expo MCP tools are not exposed in the active agent session, say so clearly and use CLI, simulator, Maestro, or browser alternatives where practical.
