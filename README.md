# Testron

Server-backed Electron test recorder that persists recoverable drafts and emits
deterministic Playwright TypeScript.

## Workspaces

- `apps/desktop` — Electron application, renderer, local persistence, and replay.
- `apps/server` — PostgreSQL/Drizzle canonical persistence and typed tRPC API.
- `apps/web` — the public site at testron.dev; a static build served by nginx.
- `packages/domain` — platform-independent schemas and test behavior.
- `packages/protocol` — shared Zod client/server contracts.
- `packages/test-fixtures` — controlled websites used by recorder and replay tests.

## Run

```sh
pnpm install
pnpm start
```

Create a project, add an environment with its base URL and test-ID attribute,
then create a test. Start recording and use the embedded page. You can pause,
undo, finish, reorder or delete steps, review the human-readable or Playwright
form, and copy or export the generated `.spec.ts` file. Unsaved drafts are
restored from SQLite when Testron restarts.

For server-backed operation, copy `.env.example` to `.env`, start PostgreSQL with
`pnpm server:db:up`, then
follow [the server runbook](docs/server-operations.md). Canonical workspace data
is read directly from the server and kept in memory; SQLite retains local drafts
and local replay state.

## Verify

```sh
pnpm check
pnpm test:replay
pnpm build
pnpm test:electron
```

The replay command runs the checked-in source generated from the canonical fixture steps against the controlled local fixture. The Electron suite verifies the tested website's sandbox, the recording pipeline, and persistence across an application restart.

## Windows test build from macOS

```sh
pnpm make:win
```

This creates a portable Windows x64 ZIP under `apps/desktop/out/make/zip/win32/x64/`.
The packaged app uses `https://testron.dev` as its server; the friend testing it
can extract the ZIP and run `Testron.exe`. The build is unsigned, so Windows may
show a SmartScreen warning.
