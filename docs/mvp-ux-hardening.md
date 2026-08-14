# MVP UX Hardening

## Goal

Turn the completed recording and replay capabilities into a coherent MVP before
committing to distribution, deployment, and collaboration architecture.

This phase is about workflow usability rather than decorative polish. A QA
engineer should understand where they are, what Testron is doing, what failed,
and what to do next without developer guidance.

## Product direction

Testron is a server-backed test platform with three clients:

- The desktop application records, verifies, edits, and locally replays tests.
- The web application manages projects, environments, tests, revisions, and run
  results.
- The CLI moves tests between Testron and a developer's repository.

The server is the canonical source of project and test data. Desktop persistence
may cache data and protect in-progress work, but it is not the long-term system
of record once server synchronization is introduced.

## Recommended delivery sequence

### 1. Define and validate the product workflow

Design the application structure, navigation, and primary user flow before
changing repository or deployment architecture.

The primary workflow is:

1. Open or create a project.
2. Select an environment.
3. Create or open a test.
4. Record actions and expected outcomes.
5. Review and edit structured steps.
6. Run the test.
7. Diagnose a failure.
8. Repair the failed step and rerun it.
9. Save the finished revision to the server.
10. Export it or pull it into a source repository with the CLI.

Validate the authoring workflow in the desktop application before adding server
and CLI complexity. This validates the interaction model, not a permanent
local-first architecture.

### 2. Harden the MVP user experience

Replace the current fixed-height, all-in-one toolbar with an application shell
that gives each activity enough space and a clear place in the navigation.

Suggested structure:

```text
Project
  Tests
    Record
    Review
    Run and diagnose
  Environments
  Sync status
  Project settings
```

The tested website remains the main workspace while recording. Project setup,
step review, and failure diagnosis should use dedicated panels or screens rather
than competing for the same toolbar area.

#### Project and navigation

- Make the selected project, environment, and test visible at all times.
- Separate selection from creation; creation forms should not permanently occupy
  the main workspace.
- Provide clear empty states for a new installation, project, environment, and
  test.
- Preserve the user's current location and selection across restarts.
- Warn before navigation would discard unsaved or active recording work.
- Show whether the selected test is saved, syncing, synced, conflicted, or
  unavailable because the server cannot be reached.

#### Recording

- Make Record, Verify, Pause, Finish, and current recording state unambiguous.
- Explain that actions performed while paused are not captured.
- Surface unsupported interactions where they occur and keep them available for
  later review.
- Keep the tested page large enough to behave like the application under test.
- Make the latest captured step visible without obscuring the tested page.

#### Review and editing

- Give the ordered step list a dedicated, readable workspace.
- Make action, target, value, assertion, and locator visually distinguishable.
- Keep locator-quality warnings actionable rather than merely informational.
- Support editing, duplication, deletion, and reordering without losing context.
- Make secret placeholders visibly different from ordinary values.
- Treat generated Playwright as a useful preview and export artifact, while
  keeping structured steps as the source of truth.

#### Replay and diagnosis

- Show queued, running, passed, failed, cancelled, and timed-out states clearly.
- Keep the failed structured step selected after a run.
- Show the exact action, locator, Playwright error, and current page URL together.
- Display the failure screenshot directly in the application.
- Provide an explicit action to open the Playwright trace.
- Let the user select an alternative locator and rerun with minimal navigation.
- Explain timeout and cancellation behavior.
- Explain the scope and revision of reusable authentication state.

#### Environment variables and authentication

- Show which variables are required before a run begins.
- Keep secret values session-only and never write them to project storage, logs,
  screenshots, or generated source.
- Scope authentication state to one environment and one revision.
- Increment the revision when authentication state is explicitly cleared or when
  a future environment change invalidates its authentication assumptions.
- Make it clear whether the next run will load, create, replace, or ignore saved
  authentication state.

#### Feedback and recovery

- Provide useful loading, success, empty, error, and cancellation states.
- Do not use transient notifications as the only record of an important failure.
- Make artifact locations understandable and openable from the UI.
- Preserve enough run information for the user to inspect the most recent result.

## UX exit criterion

A QA engineer unfamiliar with Testron can create a project and environment,
record a test with assertions, run it, identify a failed structured step, repair
its locator, rerun successfully, and export the test without developer guidance.

The workflow must also remain understandable when a page fails to load, a secret
is missing, a locator is ambiguous, a run times out, or the user cancels a run.

## 3. Prepare the monorepo

Move to a monorepo only after the product workflow establishes the boundaries we
need. The migration should initially be mechanical and must not change desktop
behavior.

Suggested structure:

```text
apps/
  desktop/
  web/
  server/
  cli/
packages/
  domain/
  protocol/
  test-format/
  test-fixtures/
```

- `apps/desktop` owns Electron, recording, local replay, and a recoverable local
  working cache.
- `apps/web` owns browser-based project, test, revision, and run management.
- `apps/server` owns canonical persistence, authentication, authorization,
  revision history, and remote APIs.
- `apps/cli` owns repository import, export, pull, push, and conflict reporting.
- `packages/domain` contains platform-independent schemas and behavior that are
  genuinely shared by multiple clients.
- `packages/protocol` contains explicitly versioned client/server contracts.
- `packages/test-format` defines the durable, Git-friendly representation used
  by the CLI.
- `packages/test-fixtures` contains controlled applications used by both local
  and integration tests.

Do not move Electron IPC types into the server protocol package. They cross
different trust boundaries and should remain independently versioned.

### Monorepo exit criterion

The desktop application starts, records, replays, packages, and passes the same
tests after the move. Web, server, and CLI packages build independently. Shared
domain, protocol, and test-format packages have explicit public APIs rather than
depending on application internals.

## 4. Server, CLI, web, and distribution delivery

The next product phase establishes the server as the system of record and adds
the CLI as the bridge between Testron and source repositories.

### Canonical data and revisions

- Give projects, environments, tests, steps, and test revisions stable IDs.
- Save immutable or auditable test revisions rather than silently overwriting
  the last known server state.
- Use optimistic concurrency for desktop, web, and CLI writes.
- Require a client to provide the base revision it edited.
- Reject or explicitly merge a push when the server changed since that revision.
- Define deletion, restoration, ownership, permissions, and audit rules before
  allowing multiple writers.

### CLI workflow

The intended developer workflow is:

```text
testron login
testron pull
# Edit generated or structured test files in the repository.
testron push
```

- `testron pull` materializes selected server tests into a deterministic
  directory structure.
- A checked-in manifest preserves server IDs, revisions, environment mappings,
  and format versions without storing credentials.
- Pull output is stable so unchanged tests do not create Git diffs.
- `testron push` validates files locally, shows the proposed change set, and
  uploads changes against their recorded base revisions.
- Push must report unsupported edits rather than guessing how arbitrary
  Playwright code maps back to structured steps.
- The CLI should support non-interactive authentication and exit codes for CI,
  while never writing access tokens into the project directory.
- Import and export capabilities should share the same versioned test-format
  package rather than implementing separate converters.

Initial CLI limitations should be explicit. A safe first version can accept
structured Testron files and regenerate Playwright, while treating arbitrary
manual edits to generated `.spec.ts` files as export-only until a bounded import
format is defined.

### Server foundation

- Store canonical project, environment, test, step, and revision data.
- Authenticate desktop, web, and CLI clients using flows appropriate to each
  client type.
- Enforce project authorization on every operation.
- Expose a versioned API for snapshots, revisions, pull, push, and conflicts.
- Keep recorder observations and secret values out of server logs.
- Store secret references separately from secret material; define an explicit
  secret-management product before executing tests on server infrastructure.

### Web application

- Browse projects, environments, tests, and revision history.
- Review structured steps and generated Playwright.
- Show synchronization conflicts and recent run results.
- Reuse domain language and visual states from the desktop application.
- Avoid promising browser-based recording until its browser-control and security
  model is deliberately designed.

### Desktop distribution

- Signed macOS and Windows builds.
- Update delivery.
- Project bundle import and export.
- Git-friendly Playwright project export.
- Stored-step schema compatibility and migration policy.

### Deployment exit criterion

Non-developers can install and update Testron. Desktop and web clients read and
write canonical server revisions. A developer can pull tests into a repository,
make supported changes, review the diff, and push a new revision without losing
concurrent server changes.

## Guardrails

- Structured steps remain the canonical representation.
- The server is the canonical source for synchronized project and test data.
- Desktop recording must protect in-progress work through disconnects and
  crashes, then reconcile it explicitly with the server.
- Secrets are not synchronized by default.
- Monorepo structure is not permission to share code across incompatible trust
  boundaries.
- Pull and push are revision-aware operations, not blind file transfers.
- Generated Playwright is not parsed back into structured steps unless the
  supported edit surface is deliberately specified.
