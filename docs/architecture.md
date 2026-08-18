# Testron Architecture

## Architectural direction

Testron is a server-backed platform with desktop, web, and CLI clients. The
server is the canonical source for synchronized project and test data. Clients
may cache data and preserve drafts, but synchronization always occurs through
explicit, revision-aware server contracts.

The existing desktop application remains the validated recorder and local replay
foundation. The transition to a monorepo and server must preserve that behavior
while changing canonical ownership from a single local SQLite database to the
server.

## Target repository layout

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

- `apps/desktop` owns Electron, recording, local replay, artifacts, and a
  recoverable local working cache.
- `apps/web` owns browser-based project, revision, and run-result management.
- `apps/server` owns canonical persistence, authentication, authorization, and
  revision APIs.
- `apps/cli` owns login, pull, push, import, export, validation, and conflict
  reporting for repository workflows.
- `packages/domain` owns platform-independent schemas and behavior used by at
  least two applications.
- `packages/protocol` owns versioned client/server request and response schemas.
- `packages/test-format` owns the durable Git-friendly test and manifest formats.
- `packages/test-fixtures` owns controlled applications used by recorder and
  replay tests.

The monorepo migration should initially be mechanical. Desktop behavior and test
coverage must remain unchanged during the move.

## Technology constraints

The validated desktop stack is:

- Electron and Electron Forge.
- TypeScript and React.
- Vite for renderer and Electron bundle development.
- Plain CSS and CSS variables.
- `node:sqlite` for the desktop working cache.
- Zod at persistence, IPC, API, and file-format boundaries.
- Playwright Test for local replay and generated-source validation.
- Vitest for domain and unit tests.

Server, web, monorepo, and deployment technologies should be selected when their
requirements are concrete. The architecture requires versioned contracts,
transactional canonical persistence, authentication, authorization, and
optimistic concurrency, but it does not yet require a particular web framework,
database, hosting provider, or package manager.

## Canonical ownership

The server owns synchronized:

- Projects and membership.
- Environments and their revisions.
- Tests, structured steps, and revision history.
- Supported metadata and run summaries.
- Deletion and restoration state.

The desktop owns local-only:

- In-progress recording observations before normalization.
- Unsynchronized drafts and an outbox of intended writes.
- Local Playwright run processes and cancellation state.
- Screenshots, traces, and reusable local authentication state unless a future
  feature explicitly uploads them.
- Session-only secret values.

The repository owns files materialized by the CLI. Its manifest identifies the
server objects and base revisions represented by those files; it does not make
Git an invisible second server database.

## Revision model

Every mutable synchronized resource has a stable ID and revision identifier. A
client write supplies the base revision it observed.

```text
client reads revision 12
  -> client proposes changes based on revision 12
  -> server compares current revision
     -> still 12: validate, commit, return revision 13
     -> no longer 12: reject with structured conflict information
```

The initial system should prefer immutable test revision records plus a pointer
to the current revision. This makes desktop saves, web edits, CLI pushes, audit
history, and restoration use the same model.

Last-write-wins is not acceptable for test content. Automatic merging should be
introduced only for fields with well-defined merge semantics.

## Desktop process model

The desktop application has three trust zones.

### Main process

The Electron main process owns:

- Window and `WebContentsView` lifecycle.
- Navigation and popup policy.
- Recording-session state transitions.
- Local working-cache access and migrations.
- Local Playwright replay, cancellation, traces, and screenshots.
- Server synchronization and secure token access through a narrow adapter.
- File export and safe operating-system integration.
- Validated IPC handlers.

### Application renderer

The React renderer owns:

- Project, environment, test, and synchronization screens.
- Recording controls and structured step review.
- Local run progress and failure diagnosis.
- Conflict presentation and resolution workflows.
- Generated Playwright preview.

It receives a narrow API through its preload bridge. It does not access Node.js,
the local database, authentication tokens, or the server transport directly.

### Tested website

The tested website runs in a separate sandboxed `WebContentsView` with:

- `nodeIntegration: false`.
- `contextIsolation: true`.
- `sandbox: true`.
- A dedicated recorder preload.
- No general-purpose Electron, server, filesystem, or IPC API exposure.

The recorder preload observes supported DOM events, extracts sanitized metadata,
and sends validated candidates to the main process. Remote content must never
choose IPC channel names or invoke synchronization or privileged operations.

## Recorder pipeline

```text
DOM event
  -> sanitized observation
  -> candidate locator extraction
  -> action normalization
  -> structured step
  -> recoverable desktop draft
  -> server revision
  -> desktop and web presentation
  -> CLI test format
  -> Playwright TypeScript generator
```

Each layer should remain independently testable. Recording, normalization, and
code generation operate on domain values and do not call the server directly.

## Instrumentation boundary

Testron does not depend on Playwright's private recorder internals. The desktop
recorder uses Electron DOM instrumentation:

- Capture listeners are installed before application code where possible.
- Click candidates include role, accessible name, labels, test IDs, relevant
  attributes, text, frame information, and URL context.
- Input events are buffered and collapsed into one fill step.
- Change events distinguish select, checkbox, and radio interactions.
- Keyboard events record meaningful presses rather than normal typing.
- Electron navigation events capture document and in-page navigation.
- Sensitive field observations omit their values.

Playwright public APIs execute structured steps locally and produce screenshots
and traces. Generated output uses public locator and assertion APIs.

## Desktop drafts and synchronization

The current SQLite repository becomes a working cache rather than canonical
storage. Its future synchronization model should include:

- The last acknowledged server revision for each cached object.
- Recoverable local drafts.
- An explicit outbox of pending create, update, and delete operations.
- Idempotency keys for retried writes.
- Sync status and structured conflict state.
- A clear distinction between server data, local edits, and transient run data.

Recording must survive a crash or temporary disconnect. Reconnection may upload
the draft only after comparing its base revision with the current server
revision. A client must never silently replace newer server work.

## Server boundaries

The server exposes versioned operations for:

- Authentication and client sessions.
- Project and membership access.
- Environment snapshots and revisions.
- Test snapshots, revision history, and conflicts.
- Batch pull and push used by the CLI.
- Run summaries when remote result storage is introduced.

Every operation validates its payload and authorizes access to the target
project. Canonical writes are transactional and return the committed revision.
API transport types belong in `packages/protocol`; database records and framework
request objects do not.

The server initially stores structured tests, not arbitrary executable code or
secret values. Server-side test execution requires a separate threat model,
isolation design, secret-delivery mechanism, and job architecture.

## CLI and repository format

The CLI is a first-class client, not a wrapper around generated files.

```text
server snapshot
  -> testron pull
  -> versioned structured files + manifest + generated Playwright
  -> supported developer edits
  -> local schema and semantic validation
  -> testron push with base revisions
  -> server conflict check and new revision
```

Required format properties:

- Deterministic ordering and formatting.
- Stable output when server data has not changed.
- Explicit schema and generator versions.
- Stable project, environment, and test IDs in a manifest.
- Base revisions for optimistic concurrency.
- Paths that remain understandable in Git diffs.
- No credentials or secret material.

The structured format is round-trippable. Generated `.spec.ts` files are output.
Arbitrary edits to generated Playwright are initially export-only because a
general code-to-steps parser would be ambiguous and unsafe. If direct code edits
become a requirement, Testron must define a bounded syntax or AST contract before
accepting them in `push`.

## Web application boundary

The web application uses the same versioned server protocol and domain language
as desktop and CLI, but it does not share Electron IPC or desktop persistence
types.

Its initial responsibilities are project navigation, test review, revision
history, conflicts, settings, and run-result presentation. Browser-based
recording remains out of scope until a dedicated browser-control design exists.

## Authentication and authorization

- Desktop and web use interactive user authentication appropriate to their
  platforms.
- CLI authentication supports interactive login and non-interactive CI use.
- Long-lived credentials use operating-system or CI secret storage, never the
  repository manifest.
- Server authorization is enforced per project operation and cannot rely on
  client-side filtering.
- Tokens and secret values are excluded from logs, traces, analytics, and error
  payloads.
- Tested website content cannot access Testron credentials or server APIs.

## Schema and compatibility policy

Four boundaries require explicit, independent versions:

1. Structured step schemas.
2. Server API protocol schemas.
3. CLI test and manifest formats.
4. Desktop working-cache migrations.

Readers should reject unsupported future versions with actionable errors. Server
and CLI deployments must define supported version ranges. Migrations should be
tested with fixtures from prior released versions.

Electron IPC is a separate trust boundary and must not be reused as the server
protocol merely because some domain payloads look similar. Desktop IPC schemas
may compose the same protocol-owned leaf invariants for canonical fields such as
IDs, names, titles, and HTTP URLs; their command envelopes and inferred types
remain desktop-owned.

## Deployment boundaries

Desktop distribution and server/web deployment are separate release tracks:

- Desktop releases require signed macOS and Windows packages and update delivery.
- Web and server releases require compatible protocol versions and database
  migrations.
- CLI releases require compatible protocol and file-format ranges.
- A server deployment must not force already-running clients to corrupt or
  silently reinterpret cached data.

Compatibility checks should fail clearly before a write when a client or format
version is unsupported.

The accepted protocol v1 resource invariants, operation schemas, conflict
outcome, idempotency rules, and migration policy are recorded in
[`protocol-v1.md`](protocol-v1.md). That decision is the implementation input
for the Phase 4 server transport; handlers and database records must adapt to it
rather than redefine it.

## Architecture guardrails

- The server is authoritative for synchronized project and test data.
- Structured steps remain the canonical test representation.
- Recording observations and secret values are never sent as unvalidated raw
  payloads.
- Client writes are revision-aware; test content does not use last-write-wins.
- Generated Playwright is not reverse-parsed without a bounded contract.
- Desktop drafts remain recoverable through crashes and disconnects.
- Server-side execution is not added without isolation and secret-delivery
  designs.
- Shared packages expose narrow APIs and do not collapse distinct trust
  boundaries.
- No undocumented Playwright internals are used.

## Validated desktop checkpoint

Status: accepted on 2026-08-14.

The desktop spike validates the recorder, structured persistence, assertions,
locator alternatives, local replay, failure diagnosis, screenshots, traces,
cancellation, timeouts, and reusable local authentication state. A sandboxed
`WebContentsView` retains its recorder preload across navigation and exposes no
Node, Electron, Testron, or `require` global to tested content.

Continue using the embedded `WebContentsView` for desktop recording. The next
architecture checkpoint is a thin server-and-CLI vertical slice that proves
revision-aware pull and push before broader web or collaboration work.
