# Browser authentication flows

Status: proposed

## Summary

Testron should support reusable browser authentication for local desktop runs
and unsupervised server runs. A profile selects an authentication flow. The
flow runs a designated login test with secret bindings and captures the
resulting Playwright `storageState`. Desktop and server runners reuse separate
encrypted copies until that state becomes stale.

This supports applications whose authenticated state spans cookies, local
storage, and IndexedDB. Short-lived sessions can be refreshed without human
involvement or application-specific long-lived tokens.

## Goals

- Run a browser login flow once and reuse its state across authenticated tests.
- Run and refresh authentication without desktop participation.
- Share synchronized flow configuration between desktop and server execution.
- Keep desktop and server state caches separate.
- Refresh expired or invalid state with bounded retry behavior.
- Keep credentials and browser state out of logs, traces, screenshots,
  generated source, renderer state, and ordinary APIs.

## Non-goals

- Sharing a captured desktop session directly with server workers.
- Generating application-specific long-lived tokens.
- Automating CAPTCHA or interactive MFA without an external provisioner.
- Uploading authentication state as an ordinary run artifact.

## Existing foundation

The desktop runner already loads Playwright storage state and can save state
after a successful run. The main process scopes its current state path by
environment and profile and can clear it.

This feature must tighten that behavior: only an explicit authentication flow
may create or replace reusable state. An ordinary test must never overwrite it.

## Domain model

Separate three concepts:

- **Profile** describes the identity or role under test.
- **Authentication flow** describes how that profile signs in.
- **Authentication state** is derived secret material cached independently by
  each execution target.

Add a profile authentication type:

```ts
type ProfileAuthenticationType = 'credentials' | 'cookies' | 'headers' | 'browser-session';
```

Add a synchronized authentication-flow resource:

```ts
interface BrowserAuthenticationFlow {
  id: string;
  projectId: string;
  name: string;
  type: 'browser-login';
  setupTestId: string;
  revision: number;
  refreshPolicy: {
    mode: 'when-stale' | 'before-every-run';
    maxAgeSeconds: number;
    refreshBeforeExpirySeconds: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

Configure the flow and secrets per profile environment:

```ts
interface ProfileEnvironmentAuthentication {
  profileId: string;
  environmentId: string;
  authFlowId: string;
  secretBindings: Record<string, { secretId: string }>;
}
```

Initially, a flow references an ordinary saved test rather than introducing a
second step language. The setup test must:

- Belong to the same project.
- Support the target environment.
- Include an assertion proving that login succeeded.
- Not require an authentication flow itself.
- Not depend on authenticated prerequisites.
- Not be deletable while a flow references it.

## Secret management

Unsupervised execution requires server-managed, write-only secrets. Profile
variables stored as ordinary database text are not an acceptable credential
store.

```ts
interface ProjectSecretMetadata {
  id: string;
  projectId: string;
  name: string;
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Requirements:

- Encrypt values at rest with a deployment-managed key.
- Accept values only through dedicated create and replace operations.
- Return metadata, never plaintext, after creation.
- Resolve plaintext only inside an authorized execution worker.
- Audit secret creation, replacement, deletion, and worker access without
  recording values.
- Redact sensitive fills before test steps are synchronized or persisted.
- Never put values in worker logs, traces, screenshots, run records, generated
  source, or error payloads.

## Authentication-state identity

Desktop and server caches use the same validity inputs but independent state:

```ts
interface AuthenticationStateIdentity {
  owner: 'desktop' | 'server';
  testronAccountId?: string;
  projectId: string;
  environmentId: string;
  environmentAuthRevision: number;
  profileId: string;
  profileRevision: number;
  authFlowId: string;
  authFlowRevision: number;
  setupTestId: string;
  setupTestRevision: number;
  secretBindingsRevision: number;
  browserEngine: 'chromium';
  formatVersion: 1;
}
```

State becomes stale when an identity field changes, it is explicitly cleared,
its inferred expiration approaches, or its configured maximum age is exceeded.

## Creating or refreshing state

A desktop runner or server worker must:

1. Acquire a single-flight lock for the profile and environment.
2. Start a clean browser context without previous authentication state.
3. Resolve the flow and its secret bindings.
4. Run the designated setup test.
5. Capture state only if every step and success assertion passes.
6. Capture cookies, local storage, and IndexedDB:

   ```ts
   const storageState = await context.storageState({ indexedDB: true });
   ```

7. Derive expiration metadata.
8. Encrypt and atomically store the state and metadata.
9. Discard the login context.

A failed refresh must never replace previously stored state. Stale state may
remain available for diagnosis but must not be used for a new run.

## Expiration detection

Use the earliest of:

1. An expiring cookie in the captured state.
2. A best-effort JWT `exp` claim found in a cookie or local-storage value.
3. `createdAt + maxAgeSeconds` from the flow configuration.

JWT parsing is expiry discovery only. An unverified payload must never be used
as trusted identity or authorization information.

Refresh when:

```ts
expiresAt <= now + refreshBeforeExpirySeconds;
```

If no token expiration can be inferred, use the configured maximum age.

## Server run lifecycle

Before an authenticated server test starts, the scheduler or worker must:

1. Resolve the environment, profile, flow, and secret bindings.
2. Acquire the state lock for the profile and environment.
3. Load valid cached server state or refresh it using the flow.
4. Release the lock after an atomic cache update.
5. Create a new context using the decrypted storage-state object.
6. Run the requested test without allowing it to overwrite reusable state.

The flow and requested test use separate browser contexts. If the flow fails,
the requested test does not start. The run reports a blocked authentication
prerequisite and identifies the failed flow step.

Workers must be isolated by run. A worker receives only secrets and state for
its assigned project, profile, and environment. Decrypted values should exist
only in worker memory for the shortest practical time.

## Retry policy

If apparently valid state encounters a configured authentication failure:

1. Invalidate the cached state.
2. Run the authentication flow once.
3. Retry the requested test once in a new context.

Never create an unlimited refresh loop. Initially, authentication failure
signals include HTTP 401 plus an optional profile-configured login URL pattern.
Do not assume every redirect or HTTP 403 means an expired session.

## Desktop behavior

Desktop uses the same flow configuration but maintains encrypted local state.
It does not upload captured state to the server.

Replace path-based runner inputs with in-memory state:

```ts
interface ReplayOptions {
  initialStorageState?: StorageState;
  captureStorageState?: boolean;
  // Existing run options.
}
```

Only a flow run enables `captureStorageState`. Return captured state to the
Electron main process through an internal-only result and remove it before any
snapshot reaches the renderer.

Encrypt local state with Electron `safeStorage`. Pass the decrypted object to
`browser.newContext` without a plaintext temporary JSON file. Remove existing
plaintext state files during migration and require regeneration.

Replace:

```ts
reuseAuthState: boolean;
```

with:

```ts
authStateMode: 'ignore' | 'reuse' | 'refresh';
```

A compatibility adapter may translate old commands during migration.

## Server storage

Server state is an encrypted derived artifact, not a profile variable or run
artifact.

Requirements:

- Encrypt payloads with a deployment-managed key and support key rotation.
- Never return payloads through browser-facing APIs.
- Apply retention limits and delete obsolete revisions.
- Invalidate state when profiles, environments, flows, setup tests, or bound
  secrets change.
- Prevent cross-project access in repository authorization and worker jobs.
- Apply equivalent encryption and retention to backups containing state.

## User interface

The profile editor should expose:

```text
Authentication type: Browser login
Authentication flow: Sport Analytics login
Environment: Development
Username secret: E2E_SA_USERNAME
Password secret: E2E_SA_PASSWORD
Refresh: Automatically when stale
Maximum age: 12 hours
Refresh before expiry: 15 minutes
```

Actions:

- Test authentication flow.
- Refresh desktop session.
- Refresh server session.
- Clear sessions.
- View state status.

Display state without exposing tokens:

```text
Desktop: Ready · expected expiry today at 23:59
Server: Ready · last refreshed 14:32
```

States are `not-created`, `refreshing`, `ready`, `stale`, and
`refresh-failed`. Important failures must remain visible rather than appearing
only as transient notifications.

## Sport Analytics acceptance scenario

1. The flow navigates to `/login`.
2. It fills username and password from bound secrets.
3. It submits and asserts URL `/dashboard`.
4. Testron captures the `access_token` cookie and the `accessToken` and `user`
   local-storage values.
5. Dashboard and statistics tests contain no login steps.
6. Desktop and server runners start those tests authenticated using independent
   cached state.
7. JWT expiration at Moscow midnight makes the state stale.
8. The server refreshes state before the next unsupervised run.

## Acceptance criteria

- A successful flow produces reusable encrypted browser state.
- Cookies, local storage, and IndexedDB restore in a new context.
- A server worker authenticates without desktop participation.
- Desktop and server share configuration but not captured state.
- Concurrent stale server runs cause at most one refresh per profile and
  environment.
- Ordinary tests cannot overwrite state.
- Failed refresh cannot replace state.
- Profile, environment, flow, setup-test, or secret changes invalidate state.
- Expired state refreshes according to policy.
- A stale-state retry happens at most once.
- Projects, profiles, and environments never share state accidentally.
- Secrets and state never enter renderer state, ordinary APIs, logs, traces,
  screenshots, run artifacts, analytics, or generated source.
- Desktop and server expose manual refresh and clear operations.
- Authorization prevents cross-project secret and state access.

## Plan B: provisioned state

For CAPTCHA, non-automatable MFA, or another flow that cannot run in a worker,
allow a trusted provisioning command to import Playwright `storageState`.
Imported state follows the same encryption, scoping, expiration, invalidation,
and retention rules.

An application-specific long-lived-session script is a last-resort provisioner,
not the default authentication design.
