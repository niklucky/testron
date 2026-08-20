# Testron Domain Model and Protocol v1

Status: accepted for Phase 3 on 2026-08-17.

This document fixes the first client/server compatibility boundary. It is an
architecture contract for the Phase 4 server slice, not an HTTP design. Routes,
headers, status codes, framework objects, authentication tokens, and database
records remain outside `packages/protocol`.

## Vocabulary and ownership

Canonical server values are:

- A **project** is the authorization boundary. It has one owning user in v1.
  Environments and tests are owned through their project; clients cannot move
  them between projects.
- An **environment** belongs to one project and defines a public HTTP(S) base
  URL and locator configuration. Credentials, profile values, browser storage,
  and authentication state are not environment protocol data.
- A **test** is a stable identity and a pointer to its current immutable
  revision. Its title, environment, ordered step entries, and assertions live
  in revisions so every content change is auditable.
- A **test revision** is immutable. Revision 1 has no parent. Each later
  revision points to the immediately preceding revision and increases the
  number by one. A revision is never updated in place.
- A **step entry** has a stable ID plus a v1 structured-step payload. Its ID is
  preserved when the step is edited or reordered across revisions. Duplicating
  a step creates a new ID. Assertions are structured steps and follow the same
  rule.

Canonical IDs are UUIDs. Server-created resource and revision IDs are assigned
by the server. Step IDs originate in the authoring client and the server checks
that they are unique within a revision. Canonical timestamps are server-assigned
UTC ISO-8601 instants. A client timestamp must never determine revision order.

Projects, environments, and tests have an explicit active or deleted state.
Deletion identifies the actor and server time. Immutable revisions are retained
as history and are not independently deleted. Protocol v1 defines deletion
state so snapshots remain unambiguous, but Phase 4 does not need deletion write
operations for its initial vertical slice.

## Canonical data versus desktop state

The server owns project, environment, test, and test-revision schemas in
`packages/protocol/src/resources.ts`. The desktop-only schemas in
`apps/desktop/src/main/sync/client-state.ts` deliberately do not appear on the
wire:

- A **draft** is recoverable local content plus its last acknowledged base
  revision. Its `draftId`, `localCreatedAt`, and `localUpdatedAt` fields are
  explicitly local; a new unsynchronized test has no server test ID or base
  revision.
- A signed-in desktop may hold the current canonical workspace in process
  memory. It is not persisted as a second server dataset and is discarded when
  the session ends.
- A **local run** points to either a canonical revision or a draft. Its process
  state, cancellation, screenshot, trace, reusable browser authentication
  state, and errors stay local in v1.
- Authentication tokens, profile values, resolved variables, and secret values
  are local state and are never protocol resources.

The desktop draft repository redacts resolved values, assigns stable step IDs
when Phase 2 steps first become synchronized, retains those IDs after a save,
and carries the acknowledged revision into every later save.

## Revision-aware writes and conflicts

Test creation submits initial revision content and has no base revision. Every
later content write must submit both the ID and number of the exact base
revision observed by the client.

The server handles a save in one transaction:

1. Authenticate the caller and authorize access to the test's project.
2. Validate protocol and step versions, the request, and semantic invariants.
3. Lock or otherwise serialize the test's current-revision pointer.
4. Compare both parts of the submitted base pointer with the current pointer.
5. If equal, insert one immutable revision and advance the pointer.
6. If unequal, make no content change and return `revision_conflict` containing
   the submitted pointer and the current canonical snapshot.

Comparing a revision number alone is insufficient. A stale write is never
automatically merged and never overwrites the current revision. The client may
show the returned snapshot, preserve its draft, and ask the user to rebase or
resolve it in a later workflow.

## Idempotency

Every mutation includes a client-generated idempotency key. Its scope is the
authenticated principal plus operation name plus key.

- The server fingerprints the validated semantic request body, including the
  target and base revision, but excluding request correlation and client
  diagnostic fields.
- Recording the fingerprint, canonical mutation, and logical outcome is part of
  the same transaction.
- A retry with the same scope and fingerprint returns the same logical success
  or error with the retry's request ID. It does not create another resource or
  revision.
- Reusing the key with a different fingerprint returns
  `idempotency_key_reused` and performs no write.
- Full outcomes are retained for at least 30 days. A fingerprint tombstone is
  retained after outcome pruning. A later retry returns
  `idempotency_key_expired`; it is never treated as a new mutation.
- Concurrent identical requests converge on one transaction and one outcome.

Clients create one deterministic key per intended draft write and reuse it
until that write has a terminal acknowledgement. This does not require a
persisted transport outbox.

## Version and migration policy

The outer protocol schema and structured-step schema are independently
versioned. Protocol v1 accepts protocol version 1 and structured-step version 1.
The version compatibility probe runs before operation parsing so callers get an
actionable old/future-version error instead of a generic validation failure.

- Readers reject versions above their supported maximum without inspecting the
  payload as a known shape.
- Protocol version 0 was never released and has no migration. It is represented
  by a compatibility fixture and is rejected as too old.
- When a released protocol version is retired, servers must first publish a
  supported client range and migration/release path. A transport payload is not
  silently rewritten across protocol versions.
- A future step version may be accepted only after adding an explicit pure
  migration into the domain boundary, golden old-version fixtures, and
  round-trip/semantic tests. Migration produces a new in-memory value; stored
  immutable revisions retain the version originally committed.
- Adding optional response fields still requires a new protocol schema version
  because v1 objects are strict. This favors clear compatibility failures over
  clients silently ignoring server meaning.

The checked-in compatibility suite covers a valid v1 write, an invalid secret
payload, a pre-v1 payload, unsupported future protocol and step payloads,
revision invariants, and the structured stale-write response. Each future
supported version must add equivalent fixtures before the server advertises it.

## Initial operation set

Protocol v1 defines the contracts needed by the first server slice:

- create a project;
- create an environment in an authorized project;
- create a test and its first revision;
- read the authenticated user's bounded workspace snapshot into desktop process

The workspace snapshot also carries one `projectOverviews` aggregate per accessible project. Each
aggregate is server-owned and includes suite/test totals, latest pass/fail/no-result counts, the
30-calendar-day run total and daily outcome buckets, the last completed run timestamp, and the
current in-flight count. The desktop selects the aggregate by `selectedProjectId`; it does not
derive live dashboard values from fixture data or the bounded recent-run list.

When no server workspace is configured, the dashboard remains an intentional local demonstration
mode and uses deterministic fixture values. Once a server is configured, the UI instead shows
explicit loading, empty, or error states and never falls back to those fixtures.
memory;

- read a canonical test snapshot;
- list immutable test revision history;
- save a new test revision against an observed base revision.

All operations use request/response metadata and structured errors. This set is
transport-neutral and intentionally excludes Electron IPC, broad project CRUD,
remote execution, uploaded artifacts, repository formats, and authentication
mechanics.
