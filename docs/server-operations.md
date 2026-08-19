# Server vertical-slice operations

The Phase 4 server uses PostgreSQL 17, Drizzle ORM migrations, and tRPC. Start
the development database from the repository root:

```sh
npm run server:db:up
```

The Compose service listens on `127.0.0.1:55432` with the development database
URL below. Start the server with an initial user:

```sh
DATABASE_URL='postgresql://testron:testron@127.0.0.1:55432/testron' \
TESTRON_BOOTSTRAP_EMAIL=owner@example.com \
TESTRON_BOOTSTRAP_PASSWORD='at-least-twelve-characters' \
npm run start:server
```

The server applies checked-in migrations before listening. The default listener
is `http://127.0.0.1:4400`; configure `HOST`, `PORT`, and
`TESTRON_PUBLIC_URL` when its public browser-login URL differs. `DATABASE_URL`
is required.

Start the desktop with `TESTRON_SERVER_URL` set to that public server URL. The
test view exposes sign-in and synchronization controls. Sign-in opens the
system browser; the account password is entered only into the server page. The
opaque returned session token is encrypted through Electron `safeStorage`
before local persistence.

## Migrations

Drizzle table definitions live in `apps/server/src/database/schema.ts`, and
generated SQL is checked in under `apps/server/drizzle`.

After changing the table definitions, generate and inspect a migration:

```sh
npm run server:db:generate
```

To apply checked-in migrations without starting the application:

```sh
DATABASE_URL='postgresql://testron:testron@127.0.0.1:55432/testron' \
npm run server:db:migrate
```

Stop the development service with `npm run server:db:down`. The named volume is
retained; use `docker compose -f compose.server.yml down --volumes` only when
you intentionally want to erase development data.

## API surface

Application calls use tRPC under `/trpc`, with shared strict Zod input and
output schemas exported by `@testron/protocol`:

- `auth.start` and `auth.poll` implement the desktop device-style login.
- `project.create` and `environment.create` create the bounded hierarchy.
- `workspace.get` reads the signed-in user's active canonical workspace.
- `test.create`, `test.get`, `test.history`, and `test.saveRevision` manage
  immutable test revisions and exact-base conflict checks.

The interactive browser approval form remains a normal `GET|POST
/auth/desktop` endpoint, and `GET /health` is the unauthenticated health probe.
All protected tRPC procedures require an opaque bearer session. Authorization
is checked at the project boundary. Mutation idempotency is scoped to principal,
procedure, and key.

## Verification

The server integration suite uses the Compose database by default:

```sh
npm run server:db:up
npm test --workspace @testron/server
```

Set `TESTRON_TEST_DATABASE_URL` to point the suite at another disposable
PostgreSQL database. The suite truncates application tables between tests, so
never point it at a database containing data you need to keep.
