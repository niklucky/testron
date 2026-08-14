# Testron Product Brief

## Product thesis

Testron is a server-backed test platform that helps QA engineers and developers
create, maintain, run, and exchange reliable Playwright tests.

The product has three clients with distinct jobs:

- The desktop application records browser interactions, captures assertions,
  edits structured tests, and runs tests locally.
- The web application manages projects, environments, tests, revisions, and run
  results.
- The CLI synchronizes tests between Testron and source repositories.

The user drives the test. Testron captures, normalizes, explains, stores, and
exports their intent. AI is not part of the core recording, synchronization,
code-generation, or replay path.

## System of record

The Testron server is the canonical source for synchronized projects,
environments, tests, structured steps, and revisions.

Desktop storage protects in-progress work, supports local replay, and caches
server data. It is not the authoritative copy after a test has been synchronized.
Every client writes against an explicit base revision so concurrent changes are
detected rather than silently overwritten.

## Primary users

### QA engineer

A QA engineer understands the application being tested but may have limited
JavaScript or TypeScript experience. They primarily use the desktop application
to record, verify, diagnose, and repair tests, and the web application to organize
and review them.

### Developer

A developer integrates Testron tests into a repository and CI workflow. They use
the CLI to pull deterministic test files, make supported changes, review Git
diffs, and push new revisions to the server.

### Team administrator

A project administrator manages project access, environments, and future team
settings through the web application. Administration is not part of the initial
desktop recording surface.

## Core workflows

### Desktop authoring

1. Sign in and open or create a project.
2. Select or create an environment.
3. Create a test by answering: "What are we testing?"
4. Open the environment inside Testron's recording window.
5. Record, pause, verify, undo, or finish while using the website.
6. Review and edit normalized structured steps.
7. Run the test locally and inspect step progress.
8. Diagnose a failure using its action, locator, error, URL, screenshot, and
   trace.
9. Repair the failed step and rerun it.
10. Save a new test revision to the server.

### Web management

1. Browse projects, environments, tests, and revision history.
2. Review structured steps and generated Playwright.
3. Inspect synchronization conflicts and run results.
4. Manage project-level access and settings as those capabilities are introduced.

Browser-based recording is not implied by the web application. It requires a
separate browser-control and security design.

### Repository synchronization

The intended developer workflow is:

```text
testron login
testron pull
# Review or make supported edits.
testron push
```

`testron pull` writes stable, deterministic files and a manifest containing
server IDs, base revisions, environment mappings, and format versions. It must
not write credentials into the repository.

`testron push` validates supported files, displays the proposed change set, and
creates new server revisions against the manifest's base revisions. It reports
conflicts and unsupported edits explicitly.

## Core principles

- The user remains in control of every test action and revision.
- Structured steps are the canonical test representation.
- Generated Playwright is deterministic output, not the editable source of truth.
- Recorded facts are preferable to generated guesses.
- Every test needs expected outcomes, not only a sequence of actions.
- Failures, conflicts, and unsupported interactions must be visible.
- Server, desktop, web, and CLI writes are revision-aware.
- Secrets must not be persisted in steps, generated source, manifests, or logs.
- Complexity must be justified by a concrete user workflow.

## Canonical test representation

Testron stores typed, versioned steps rather than treating Playwright source as
its model. For example:

```ts
{
  kind: 'click',
  target: {
    primary: {
      strategy: 'role',
      role: 'button',
      name: 'Sign in'
    },
    alternatives: []
  }
}
```

This can be presented as:

```text
Click the "Sign in" button
```

and generated as:

```ts
await page.getByRole('button', { name: 'Sign in' }).click();
```

Desktop and web clients edit structured steps. The CLI initially round-trips a
documented structured format and regenerates Playwright. Arbitrary Playwright
source is not parsed back into steps unless a deliberately bounded edit format is
defined later.

## A test is more than recorded actions

A recording without expected outcomes is an automation script, not a test.
Testron supports explicit assertions such as:

- An element is visible or hidden.
- Text is present or equals a value.
- A field contains a value.
- A control is enabled, disabled, checked, or unchecked.
- The current URL has an expected path.

## Supported interactions

- Main-frame navigation.
- Click.
- Fill.
- Select option.
- Check and uncheck.
- Key press.
- Basic element and URL assertions.

The UI must report interactions it cannot record. Cross-origin frames, multiple
windows, file transfer, drag and drop, canvas applications, permission prompts,
and native browser dialogs are compatibility areas rather than implicit MVP
promises.

## Locator policy

Testron ranks locator candidates in this order:

1. Configured test ID.
2. Accessible role and name.
3. Associated label.
4. Placeholder.
5. Stable user-visible text.
6. Stable attributes.
7. CSS fallback, marked as fragile.

The recorder retains useful alternatives so a locator can be repaired without
repeating the entire recording.

## Revisions and conflicts

- Every synchronized test has a stable ID and an ordered revision history.
- A write includes the base revision observed by the client.
- The server rejects stale writes instead of applying last-write-wins behavior.
- Clients show the remote and local change sets needed to resolve a conflict.
- Pull output is stable so unchanged tests do not create Git diffs.
- Push creates a revision; it does not silently mutate repository history.
- Deletion and restoration are explicit revisioned operations.

## Security and secrets

- Remote tested websites never receive Node.js access.
- The recorder has a narrow, validated event channel.
- Password input values are never stored as structured step values.
- Secret fills reference environment-variable names.
- Secret material is not included in test files, manifests, generated source, or
  application logs.
- Desktop, web, and CLI clients use authentication appropriate to their platform.
- The server enforces authorization for every project operation.
- IPC, API, persisted step, and CLI file payloads are schema-validated.

## MVP scope boundaries

The server-backed product direction does not require all platform capabilities
in the first server release. Initial non-goals include:

- Arbitrary Playwright-to-steps reverse parsing.
- Silent automatic conflict merging.
- Browser-based recording in the web application.
- Distributed test execution, scheduling, or job queues.
- Storing or distributing secret material without a dedicated secret-management
  design.
- AI-generated tests or automatic repair in the core workflow.
- Full enterprise roles, billing, analytics, and organization administration.

## Product success criterion

A QA engineer can record, verify, diagnose, repair, and save a test revision. A
developer can pull that test into a repository, make a supported change, and push
a new revision. Both users see conflicts instead of losing concurrent work, and
the resulting Playwright remains deterministic and runnable.
