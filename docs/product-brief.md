# Testron Product Brief

## Product thesis

Testron is a local-first desktop tool that helps QA engineers create reliable
Playwright tests by recording work they perform in a real browser surface.

The user drives the test. Testron captures, normalizes, explains, and exports
their actions. AI is not part of the core recording path.

## Primary user

The primary user is a QA engineer who understands the application being tested
but may have limited JavaScript or TypeScript experience. A developer can help
with technical setup such as test IDs, environment variables, authentication,
and repository integration.

## First workflow

1. Create a project.
2. Create an environment, primarily identified by its base URL.
3. Create a test by answering: "What are we testing?"
4. Open the environment inside Testron's recording window.
5. Record, pause, verify, undo, or finish while using the website.
6. Review the normalized steps in human-readable form.
7. View, copy, or export deterministic Playwright TypeScript.

## Core principles

- The user remains in control of every test action.
- Recorded facts are preferable to generated guesses.
- Structured steps are the source of truth; Playwright is generated output.
- Every test needs expected outcomes, not only a sequence of actions.
- Failures and unsupported interactions must be visible, never silently lost.
- Secrets must not be persisted in test steps or generated source.
- Local-first operation comes before accounts, cloud services, and teams.
- Complexity must be earned by observed user needs.

## Canonical test representation

Testron stores typed steps rather than treating Playwright source as its model.
For example:

```ts
{
  kind: 'click',
  target: {
    strategy: 'role',
    role: 'button',
    name: 'Sign in'
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

Generated Playwright is initially read-only. Users edit, delete, and reorder
structured steps; Testron regenerates source deterministically.

## A test is more than recorded actions

A recording without expected outcomes is an automation script, not a test.
Testron therefore needs an explicit Verify mode for assertions such as:

- An element is visible or hidden.
- Text is present or equals a value.
- A field contains a value.
- A control is enabled, disabled, checked, or unchecked.
- The current URL has an expected path.

## Initial supported interactions

- Main-frame navigation.
- Click.
- Fill.
- Select option.
- Check and uncheck.
- Key press.
- Basic element and URL assertions.

The UI must report interactions it cannot record. Cross-origin frames, multiple
windows, file transfer, drag and drop, canvas applications, permission prompts,
and native browser dialogs are later compatibility areas rather than implicit
MVP promises.

## Locator policy

Testron ranks locator candidates in this order:

1. Configured test ID.
2. Accessible role and name.
3. Associated label.
4. Placeholder.
5. Stable user-visible text.
6. Stable attributes.
7. CSS fallback, marked as fragile.

The recorder should retain useful alternative candidates so a locator can be
repaired without repeating the entire recording.

## Security and secrets

- Remote websites never receive Node.js access.
- The website recorder has a narrow, validated one-way event channel.
- Password input values are never stored.
- Secret fills reference environment variable names in generated code.
- IPC payloads and persisted step payloads are schema-validated.

## Explicit non-goals for the first prototype

- Backend or cloud synchronization.
- Testron user accounts.
- Teams, roles, or permissions.
- AI providers or automatic test repair.
- PostgreSQL, Docker, object storage, or job queues.
- Full test management, test runs, dashboards, or reporting.
- Arbitrary Playwright code editing with reverse conversion to structured steps.

## Concepts retained from Probe

- Project and environment separation.
- Configurable test-ID attribute.
- Secret redaction and environment-variable references.
- Semantic locator preference.
- Playwright TypeScript as the first export target.

Probe's AI authoring, runners, job state machines, repair loops, versioning, and
large test-management schema are not carried into Testron.
