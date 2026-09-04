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

For Hover, assertions, or a step's Repick action, point at an element to preview
its outline, then click to pin it. The locator picker stays in place while you
choose a nearby element in **Current selection**, or search a DOM tree in
**Search on page**. Use **Confirm** to commit. **Cancel**, **Escape**, or clicking
outside exits without committing; activate Hover, Assert, or Repick again to
target another element.
Normal recording does not open the picker on hover. Use **Alt/Option-click** to
edit a locator (or choose a profile variable) before recording an interaction,
or use the recorded step's Repick action afterward.

Page search snapshots the light DOM when its tab opens. Reopen **Search on page**
to include added elements or changed text/attributes; detached results are
discarded when results update. Shadow DOM content is not currently searched,
and the recorder's targeting/tree navigation does not cross shadow boundaries.

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

## Desktop releases

Push a semantic-version tag such as `v1.2.0` to build and publish the four desktop
archives. The release includes `update-manifest.json`; packaged apps check the
latest manifest at startup and verify downloaded archives with SHA-256. Set the
GitHub Actions variable `TESTRON_UPDATE_REQUIRED` to `true` before publishing a
release that older desktop versions must install before continuing.
