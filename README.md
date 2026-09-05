# Testron

Server-backed Electron test recorder that persists recoverable drafts and emits
deterministic Playwright TypeScript.

## Test requests

QA can use **Request test** on the project dashboard to submit a title, description
draft, and one or more environments without recording steps. The **Create test**
modal also offers a description field and **Request test** action. Include preconditions, actions,
and expected results in the description. Requests appear in a separate table with
**Requested** status and are excluded from runnable test counts and schedules.

The existing workspace sync carries `currentRevision.content.status` and
`currentRevision.content.description` to desktop drafts and local SQLite storage.
After implementing the test, use **Mark ready** to move it into the regular test
list. The description remains in revision history. Code generation and a separate
command to pull requests into a source repository are outside this feature.

Screenshots can be selected before creating a test or request, or uploaded later
from the test editor's **Screenshots** section. PNG, JPEG, and WebP are supported
(up to 5 MB per image, 10 images and 10 MB per test). Open a thumbnail to view it
at full size, or use **Delete screenshot** to remove the attachment permanently.
Attachments are stored in `test_attachments`, separately from test revisions;
workspace sync includes metadata, while image downloads require project access.
Apply database migration `0019_test_attachments` when updating the server.

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
Choose **Text equals** or **Text contains** for string assertions, or **Number =**,
**Number >**, **Number >=**, **Number <**, or **Number <=** to compare numeric text.
Select the recorded assertion to edit its comparison and expected value, then **Save**.
For example, change a recorded `69` to **Number >=** with an expected value of `42`.
Numeric assertions trim surrounding whitespace and accept signed decimals; empty text,
nonfinite values, and text containing units or currency symbols do not pass.

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
