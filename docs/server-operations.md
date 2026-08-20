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

Invitation email delivery is optional. Set both `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` to enable it; the sender must use a domain verified in
Resend. If the API key is present without a sender, the server refuses to start.
Without either value, invitations remain fully usable in-app but no email is
sent. Provider failures are logged and do not remove the in-app invitation.

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
