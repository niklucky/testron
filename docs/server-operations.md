# Server vertical-slice operations

The Phase 4 server uses PostgreSQL 17, Drizzle ORM migrations, and tRPC. Start
the development database from the repository root:

```sh
pnpm server:db:up
```

The Compose service listens on `127.0.0.1:55432`. Copy the development defaults
and start the server; the server automatically loads the repository-root `.env`:

```sh
cp .env.example .env
pnpm dev:server
```

The server applies checked-in migrations before listening. The default listener
is `http://127.0.0.1:4400`; configure `HOST` and `PORT` when needed.
`DATABASE_URL` is required.

Reusable browser authentication also requires `TESTRON_AUTH_ENCRYPTION_KEYS`.
Use `version:key` entries with 32-byte base64 or hex keys; the highest version
encrypts new values, while retained older versions allow key rotation. The
server refuses secret creation until this deployment-managed key is configured.

Scheduled server runs use standard five-field cron expressions evaluated in
UTC. The settings UI also renders each next occurrence in the browser's local
timezone. `TESTRON_RUN_TIMEOUT_MS` sets the per-test deadline (60 seconds by
default). Schedule checks run every second independently of the single persistent
FIFO execution worker, so long-running tests do not delay enqueueing due work.
Execution can still wait behind earlier jobs. Jobs active during a restart are
re-queued: execution is at-least-once, so previously performed test actions may
repeat. Run only one server instance until worker ownership/leases are implemented.

## Server browser network policy

Server runs support **public HTTP(S) websites only**. Localhost, private networks,
link-local/cloud metadata, reserved addresses, and local-file URLs are blocked.
There is no private-network override. This applies to authentication setup runs
as well as scheduled/manual tests; desktop recording is unaffected.

Each run starts an ephemeral, loopback-only filtering proxy outside Chromium.
It allows the selected environment origin plus exact public origins listed by
the administrator in `TESTRON_RUNNER_ALLOWED_ORIGINS` (comma-separated, for
example `https://cdn.example.com,https://login.example.com`). Include the API,
CDN and login origins the site needs; other origins fail closed. All DNS answers
must be public, and the proxy connects to a checked IP without resolving the
hostname a second time. Redirect requests and new HTTPS tunnels are checked too.
An allowed origin cannot override the non-public-address block.
DNS/VPN setups that map public hostnames to synthetic private or reserved IPs
are also blocked; the deployment must resolve targets to their real public IPs.

Chromium has no direct proxy fallback; its implicit localhost bypass is disabled.
QUIC and non-proxied WebRTC UDP are disabled, and service workers are blocked.
HTTPS WebSockets (WSS) use checked tunnels; plain WebSocket upgrades are currently
unsupported and blocked. The proxy adds no exposed port or extra container.
These controls restrict ordinary browser requests, not a compromised Chromium
process: keep the browser patched, avoid privileged containers, and use a separate
network-isolated worker if stronger process isolation is required later.

Chromium proxy behavior is documented in its
[proxy support guide](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md).
Address exclusions are conservative subsets of the
[IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/) and
[IPv6 special-purpose registries](https://www.iana.org/assignments/iana-ipv6-special-registry/).

## Failure artifacts

Failure screenshots and videos are stored below `TESTRON_ARTIFACTS_DIR`. In the
deployment Compose file this is `/data/testron/artifacts`, bind-mounted from the
same host path. Keep that directory persistent and writable by the container's
`node` user. Artifact paths are never returned through the API; authenticated
project members retrieve evidence through the run artifact endpoints.

Server artifacts are retained for 30 days after a run finishes. A background
cleanup runs at startup and hourly, independently of test execution, deleting
expired per-run directories in batches and clearing their screenshot/video links.
Migration `0018` adds a completion timestamp so later sweeps skip cleaned runs,
including runs with no evidence files. The marker is written only after removal succeeds.
Run history, results, and step feedback remain in PostgreSQL. Active runs and
desktop recordings are excluded. Failed deletions are logged and retried on the
next sweep; monitor disk usage and cleanup errors. No host cron or extra service
is required.

Invitation and password-reset email delivery is optional. Set both
`RESEND_API_KEY` and `RESEND_FROM_EMAIL` to enable it; password-reset links use
`TESTRON_PUBLIC_URL`, and the sender must use a domain verified in Resend. If
the API key is present without a sender, the server refuses to start. Without
either value, invitations remain fully usable in-app but no email is sent, while
password-reset requests are accepted without delivering a usable link. Invitation
delivery failures do not remove the in-app invitation. Password-reset delivery is
queued durably and retried in the background when the provider is unavailable.

The desktop server URL is injected when its main process is built. It defaults
to `http://127.0.0.1:4400`; set `TESTRON_SERVER_URL` only on the `pnpm build`,
`pnpm package`, or `pnpm make` command when building for a remote deployment.
No server environment variable is needed when launching the built app. Its landing
screen supports direct email/password registration and login. The
opaque returned session token is encrypted through Electron `safeStorage`
before local persistence; passwords are never stored.

For alpha deployments, the optional `TESTRON_BOOTSTRAP_EMAIL` and
`TESTRON_BOOTSTRAP_PASSWORD` variables still provision an initial account at
startup. Normal users can register from the desktop without them.

`TESTRON_LOCAL_MODE=1` bypasses remote authentication only for isolated recorder
development and tests; it is not a deployment mode.

From macOS, build the portable unsigned Windows x64 test bundle with:

```sh
pnpm make:win
```

That command injects `https://testron.dev` as the desktop server URL and writes
the ZIP to `apps/desktop/out/make/zip/win32/x64/`. Extract it on Windows and run
`Testron.exe`.

## Migrations

Drizzle table definitions live in `apps/server/src/database/schema.ts`, and
generated SQL is checked in under `apps/server/drizzle`.

After changing the table definitions, generate and inspect a migration:

```sh
pnpm server:db:generate
```

To apply checked-in migrations without starting the application:

```sh
pnpm server:db:migrate
```

Stop the development service with `pnpm server:db:down`. The named volume is
retained; use `docker compose -f compose.local.yml down --volumes` only when
you intentionally want to erase development data.

## API surface

Application calls use tRPC under `/trpc`, with shared strict Zod input and
output schemas exported by `@testron/protocol`:

- `auth.register` creates an account and first session; `auth.login` creates a
  new session for an existing account.
- `project.create` and `environment.create` create the bounded hierarchy.
- `workspace.get` reads the signed-in user's active canonical workspace.
- `test.create`, `test.get`, `test.history`, and `test.saveRevision` manage
  immutable test revisions and exact-base conflict checks.
- `runSchedule.create`, `runSchedule.update`, `runSchedule.delete`, and
  `runSchedule.enqueue` manage UTC schedules and manual queueing.

Authenticated evidence is served from
`/api/runs/:runId/artifacts/screenshot` and
`/api/runs/:runId/artifacts/video`.

`GET /health` is the unauthenticated health probe. All protected tRPC
procedures require an opaque bearer session. Authorization is checked at the
project boundary. Mutation idempotency is scoped to principal, procedure, and
key.

## Verification

The server integration suite uses the Compose database by default:

```sh
pnpm server:db:up
pnpm --filter @testron/server test
```

Set `TESTRON_TEST_DATABASE_URL` to point the suite at another disposable
PostgreSQL database. The suite truncates application tables between tests, so
never point it at a database containing data you need to keep.
