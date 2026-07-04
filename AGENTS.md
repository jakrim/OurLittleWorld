# Agent Notes

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
