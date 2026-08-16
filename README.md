# Testron

Local-first Electron test recorder that persists structured tests and emits deterministic Playwright TypeScript.

## Workspaces

- `apps/desktop` — Electron application, renderer, local persistence, and replay.
- `packages/domain` — platform-independent schemas and test behavior.
- `packages/test-fixtures` — controlled websites used by recorder and replay tests.

## Run

```sh
npm install
npm start
```

Create a project, add an environment with its base URL and test-ID attribute, then create a test. Start recording and use the embedded page. You can pause, undo, finish, reorder or delete steps, review the human-readable or Playwright form, and copy or export the generated `.spec.ts` file. Projects and tests are restored from SQLite when Testron restarts.

## Verify

```sh
npm run check
npm run test:replay
npm run build
npm run test:electron
```

The replay command runs the checked-in source generated from the canonical fixture steps against the controlled local fixture. The Electron suite verifies the tested website's sandbox, the recording pipeline, and persistence across an application restart.
