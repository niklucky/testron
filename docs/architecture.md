# Testron Architecture

## Technology stack

- Electron desktop application, pinned to an exact stable version.
- TypeScript throughout.
- React for Testron's application interface.
- Vite for renderer development and builds.
- Electron Forge for packaging and distribution.
- Plain CSS and CSS variables initially.
- `node:sqlite` for local persistence.
- Zod for domain, persistence, and IPC boundaries.
- Vitest for domain and recorder unit tests.
- Playwright Test for generated-source validation and replay tests.
- npm as the initial package manager.

This begins as one desktop package, not a monorepo.

## Process model

Testron has three distinct trust zones.

### Main process

The Electron main process owns:

- Window and `WebContentsView` lifecycle.
- Positioning the tested website below the Testron toolbar.
- Navigation and popup policy.
- Recording-session state transitions.
- SQLite access and migrations.
- File export and safe operating-system integration.
- Validated IPC handlers.

### Application renderer

The React renderer owns:

- Project, environment, and test screens.
- Recording toolbar state and controls.
- Human-readable step review and editing.
- Generated Playwright preview.
- User-facing warnings and errors.

It receives a narrow API through its preload bridge. It does not access Node.js
or the database directly.

### Tested website

The tested website runs in a separate sandboxed `WebContentsView` with:

- `nodeIntegration: false`.
- `contextIsolation: true`.
- `sandbox: true`.
- A dedicated recorder preload.
- No general-purpose Electron or IPC API exposure.

The recorder preload observes supported DOM events, extracts sanitized element
metadata, and sends validated recording candidates to the main process. Remote
page content must never choose IPC channel names or invoke arbitrary operations.

## Recorder pipeline

```text
DOM event
  -> sanitized observation
  -> candidate locator extraction
  -> action normalization
  -> structured step
  -> session persistence
  -> human-readable renderer
  -> Playwright TypeScript generator
```

Each layer should be independently testable.

## Instrumentation boundary

Testron will not depend on Playwright's private recorder internals. Playwright's
public code generator validates the product concept, but embedding undocumented
internal modules would tie Testron to implementation details that may change.

The initial recorder uses Electron DOM instrumentation:

- Capture listeners are installed before application code where possible.
- Click candidates include role, accessible name, labels, test IDs, relevant
  attributes, text, frame information, and URL context.
- Input events are buffered and collapsed into a single fill step.
- Change events distinguish select, checkbox, and radio interactions.
- Keyboard events record only meaningful presses rather than normal typing.
- Electron navigation events capture document and in-page navigation.
- Sensitive field observations omit their values.

The generated output uses Playwright's public APIs and locator conventions.
Playwright is also used as an external verifier: generated source must compile
and replay against controlled fixture applications.

## Normalization examples

- Five input events for `hello` become one `fill("hello")` step.
- Pointer down, pointer up, click, and resulting navigation normally become one
  click step rather than several user-visible steps.
- A checkbox change becomes `check` or `uncheck`.
- Enter pressed in an input becomes `press("Enter")`; ordinary character keys
  remain part of the fill action.
- DOM changes without direct user intent are not recorded as actions.

## Pause semantics

Pause stops capture but does not freeze the tested website. The UI must explain
that actions performed while paused may create state that replay cannot
reproduce. Undo-last-step is expected to be more useful and should be introduced
early.

## Initial persistence model

```text
Project
  id, name, createdAt

Environment
  id, projectId, name, baseUrl, testIdAttribute

Test
  id, projectId, environmentId, title, status, createdAt, updatedAt

Step
  id, testId, position, kind, payload
```

Step payloads are versioned and Zod-validated JSON. We should avoid prematurely
creating a relational table for every action and locator subtype.

## Suggested source layout

```text
src/
  main/
    windows/
    recording/
    persistence/
    ipc/
  preload/
    app/
    recorder/
  renderer/
    screens/
    components/
  domain/
    projects/
    environments/
    tests/
    steps/
    locators/
    codegen/
  test-fixtures/
```

Domain modules must not depend on Electron or React. Recorder normalization and
Playwright generation should run in ordinary unit tests.

## Early risks

1. Stable semantic locator generation across modern component frameworks.
2. Correct action normalization across navigation and re-rendering.
3. Recorder survival across full document navigation and frames.
4. Popup, authentication, and session behavior.
5. Differences between Electron's Chromium surface and Playwright replay.
6. Preventing tested websites from reaching privileged Electron capabilities.

The feasibility spike addresses these risks before product CRUD is expanded.
