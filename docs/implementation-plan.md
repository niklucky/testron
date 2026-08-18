# Testron Implementation Plan

## Delivery rule

Build Testron through complete user outcomes rather than isolated layers. Every
phase has an exit criterion. Do not advance because a screen, schema, or CRUD
surface appears complete; advance when the phase's behavior works end to end and
the existing behavior remains covered by tests.

The validated recorder prototype and the completed screen designs are the
starting point for this plan. The server remains the eventual system of record,
but its contracts will follow a working desktop authoring model rather than
precede it.

## Phase 1: Mechanical monorepo migration

**Status:** Complete (2026-08-16)

### Goal

Move the validated Electron prototype into a workspace structure without
changing product behavior or introducing server logic.

### Initial repository layout

```text
apps/
  desktop/
packages/
  domain/
  test-fixtures/
```

- `apps/desktop` owns Electron processes, renderer UI, IPC, local persistence,
  recording-window lifecycle, and local replay.
- `packages/domain` owns platform-independent step, locator, recording,
  presentation, and deterministic code-generation behavior shared across
  application boundaries.
- `packages/test-fixtures` owns controlled websites and their server utilities
  used by recorder and replay tests.

Do not create `shared` as a catch-all package. Do not create `protocol` or
`test-format` until the phases that define and consume those boundaries.

### Work

- Select and configure one workspace package manager.
- Move the Electron application into `apps/desktop`.
- Move platform-independent domain code into `packages/domain`.
- Move the login fixture and fixture server into `packages/test-fixtures`.
- Update Electron Forge, Vite, TypeScript, ESLint, Vitest, and Playwright paths.
- Keep root commands for development, checks, replay tests, Electron tests, and
  packaging.
- Preserve existing security boundaries and preload behavior.
- Verify that a clean checkout can install, test, run, and package the desktop
  application.

### Exit criterion

The recorder flow behaves exactly as it did before the migration. Formatting,
linting, type checking, unit tests, replay tests, Electron integration tests,
and desktop packaging all pass from the repository root. No server, remote API,
authentication, or PostgreSQL code has been introduced.

### Outcome

- npm workspaces orchestrate the repository from the root.
- Desktop, domain, and controlled fixtures have explicit package ownership.
- Root development, checks, replay, Electron integration tests, and packaging
  preserve the validated prototype behavior.

## Phase 2: Real desktop authoring loop

### Goal

Turn the prototype and designed screens into one complete, locally persistent
test-authoring workflow.

### Primary user journey

1. Create or open a project.
2. Create or select an environment.
3. Create a test with a title.
4. Record browser interactions.
5. Add at least one expected outcome.
6. Review and edit the structured steps.
7. Run the test locally.
8. Diagnose and correct a failed step.
9. Restart Testron and reopen the saved test.

### Work

#### Working application state

- Replace design-only project, suite, test, step, and run data with real state.
- Connect renderer screens through the validated preload and IPC boundary.
- Keep database access, filesystem access, and Playwright execution in the
  Electron main process.
- Make loading, empty, error, and unsupported states explicit.

#### Local data

- Retain SQLite as the desktop working store.
- Persist projects, environments, tests, structured steps, and the minimum run
  metadata needed by the authoring journey.
- Add explicit migrations and transactional test saves.
- Recover unfinished or saved work after an application restart.
- Continue to redact secret values before persistence.

#### Recording and assertions

- Complete the recording lifecycle: start, pause, resume, undo, and finish.
- Support the agreed initial actions: navigate, click, fill, select option,
  check, uncheck, and meaningful key press.
- Add initial assertions for element visibility, text, value, enabled state,
  checked state, and URL path.
- Surface unsupported interactions instead of silently dropping them.

#### Structured editing

- Display the human-readable and generated Playwright representations.
- Edit supported step fields and locator choices.
- Delete, duplicate, and reorder steps.
- Preserve deterministic Playwright generation after every supported edit.
- Validate structured steps at UI, IPC, and persistence boundaries.

#### Local replay and diagnosis

- Run an individual saved test locally.
- Display per-step progress and associate failures with structured steps.
- Show the action, locator, Playwright error, current URL, and failure
  screenshot.
- Allow a bounded correction and rerun.
- Support cancellation and timeouts without a remote job system.

### Exit criterion

A user can create a test, record actions, add an assertion, edit and reorder the
steps, run the test, correct a failure, restart Testron, and reopen the saved
test. The generated Playwright remains deterministic and runnable, secrets are
not persisted, and unsupported interactions are visible.

## Phase 3: Domain model and server protocol v1

**Status:** Complete (2026-08-17)

### Goal

Turn the model proven by the desktop authoring loop into explicit, versioned
domain and client/server compatibility boundaries.

"Freeze" means defining the first supported version and its migration rules; it
does not mean the model can never evolve.

### Repository additions

```text
packages/
  protocol/
```

`packages/protocol` owns transport-neutral request, response, error, conflict,
and synchronization schemas. HTTP handlers, framework request objects, database
records, and Electron IPC types do not belong in this package.

### Work

- Define the v1 vocabulary and invariants for projects, environments, tests,
  structured steps, assertions, drafts, revisions, and local runs.
- Separate canonical server data from desktop-only drafts, run artifacts,
  authentication state, and cached data.
- Define stable identifiers, timestamps, deletion state, and ownership rules.
- Define immutable test revisions and the pointer to a test's current revision.
- Require clients to submit the base revision they observed when changing test
  content.
- Define structured conflict responses rather than last-write-wins behavior.
- Define idempotency semantics for retried writes.
- Version structured-step and protocol schemas independently.
- Define supported-version and migration policy.
- Add schema fixtures and compatibility tests for valid, invalid, old, and
  unsupported-future payloads.
- Record the decisions in architecture documentation before implementing the
  server transport.

### Exit criterion

The first server vertical slice can be implemented from reviewed schemas and
invariants without deriving its API from UI components or database tables.
Desktop values can be converted explicitly to and from protocol values, and
stale writes have a defined conflict outcome.

## Phase 4: Server-backed vertical slice

### Goal

Make one desktop-authored test canonical on the server, including authentication,
authorization, revision history, and conflict-safe synchronization.

### Repository addition

```text
apps/
  server/
```

Start with application, transport, persistence, and database modules inside
`apps/server`. Extract `backend` or `db` packages only after another concrete
consumer or deployment boundary requires them.

### Vertical slice

```text
authentication
  -> one authorized project
  -> one environment
  -> one test
  -> immutable test revisions
  -> desktop synchronization
```

### Work

- Select the server framework, database, migration tooling, and authentication
  approach from the v1 protocol requirements.
- Implement interactive desktop authentication and secure local token storage.
- Authenticate every operation and authorize access at the project boundary.
- Implement the minimum create/read operations needed for one project and one
  environment.
- Implement test creation, snapshot reads, revision history, and revision-aware
  saves transactionally.
- Reject stale base revisions with the defined structured conflict response.
- Make retried writes idempotent.
- Convert the desktop SQLite database from sole persistence into a recoverable
  working cache with acknowledged revisions, drafts, and an outbox.
- Synchronize without exposing server credentials to the renderer or tested
  website.
- Preserve local recording and local replay during temporary disconnection.
- Add end-to-end tests across desktop, protocol, server, and database boundaries.

### Exit criterion

An authenticated user can open an authorized project and environment, author a
test in the desktop application, save it as a server revision, restart or use a
fresh desktop cache, and retrieve the same canonical test. A stale save produces
a visible conflict and never silently overwrites the newer revision. Local
recording remains recoverable during a temporary network failure.

## Phase 5: Product and collaboration expansion

### Goal

Expand the proven server-backed slice into the management, repository, and team
workflows described in the product brief.

### Work

#### Broader server capabilities

- Complete project, environment, test, revision, deletion, and restoration
  operations as required by real workflows.
- Add membership and the minimum useful project roles.
- Add run-summary storage only when a client workflow consumes it.
- Add explicit conflict review and resolution experiences.

#### Web management

- Add `apps/web` using the same versioned protocol.
- Implement project navigation, test review, revision history, conflicts, and
  project settings.
- Keep browser-based recording out of scope until it has a separate control and
  security design.

#### CLI and repository synchronization

- Add `apps/cli` for login, pull, validation, change preview, and push.
- Add `packages/test-format` when structured repository import/export becomes a
  real compatibility boundary.
- Define deterministic structured files and a manifest containing server IDs,
  base revisions, environment mappings, and format versions.
- Treat generated Playwright as output; do not accept arbitrary source as a
  round-trippable representation.
- Keep credentials and secret material out of repository files and logs.

#### Collaboration and delivery

- Expand authorization only as team workflows require it.
- Store or upload run artifacts only after defining retention, access, and
  secret-handling rules.
- Package signed desktop builds and add update delivery.
- Define compatible release ranges for desktop, server, web, CLI, protocol, and
  repository formats.

### Exit criterion

A QA engineer can manage and revise tests through the appropriate clients, and
a developer can pull deterministic files into a repository, make a supported
change, and push a new revision. Both workflows detect conflicts rather than
losing concurrent work.

## Engineering guardrails

- Structured steps are the canonical test representation.
- Generated Playwright is deterministic output, not editable source of truth.
- No AI dependency exists in recording, normalization, code generation,
  synchronization, or replay.
- No undocumented Playwright internals are used.
- Tested websites never receive Node.js, filesystem, authentication, or general
  IPC access.
- IPC, persistence, protocol, and file-format payloads are schema-validated.
- Unsupported interactions and synchronization failures are visible.
- Secret values are absent from steps, generated source, manifests, logs, and
  server payloads.
- Test-content writes are revision-aware; last-write-wins is not acceptable.
- Desktop recording and unsynchronized work remain recoverable.
- Packages represent durable boundaries or multiple concrete consumers, not
  architectural layers created in anticipation.
- Each phase preserves the tests and security guarantees of the phases before
  it.
