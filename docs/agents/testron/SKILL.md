---
name: testron
description: Author, synchronize, and run Testron portable Playwright tests or publish repository-only tests for QA visibility, including local and CI result reporting.
---

# Testron tests

Use the project's installed CLI (`testron --help`, `testron docs`) and read
`testron.config.ts`. Run `testron pull` for current suite references and IDs.
Keep credentials in TESTRON_API_KEY or the CLI credential store.

## Choose the test type

- **Portable:** `publish: true, execution: 'ci-and-testron'`. A standalone smoke
  test using `test` and `expect` from Playwright or the generated Testron local
  fixture. It remains editable and runnable in Testron and runs locally/CI.
- **CI catalogue:** `publish: true, execution: 'ci-only'` (the execution default).
  Keep repository helpers, fixtures, seeded data, and infrastructure. Testron
  receives the selected test source, description, and human-readable steps, not
  its dependencies. QA can view it and its reported runs; remote Run is disabled.
- Unpublished tests stay in the repository. `-f` does not imply publication.

This skill performs the authoring review. There is no new test-lint gate for manual
writers. Ordinary source imports trigger a catalogue downgrade; do not assume that
absence of imports proves a test portable. Unsupported code remains visible and
may fail in the existing structured runner.

## Author and review portable tests

Use one standalone test with an async `({ page })` callback. Keep behavior inside
supported Playwright page actions and locator assertions. Use relative navigation
such as `page.goto('/dashboard')`; the execution environment supplies the origin.
Use the same operations the Testron editor generates. Avoid loops, callbacks,
`test.step` wrappers, `page.evaluate`, API/database calls, custom fixtures, hooks,
and helper functions when the test must remain editable and executable as steps.
Choose a CI catalogue test for those behaviors rather than flattening complex code.

```ts
import { test, expect } from '@playwright/test';
import { testron, suites } from '../../testron.generated';

test(
  'Dashboard is available',
  testron({
    suite: suites.Dashboard,
    publish: true,
    execution: 'ci-and-testron',
    description: 'A signed-in user can reach their dashboard.',
    steps: ['Open the dashboard', 'Verify the Dashboard heading is visible'],
  }),
  async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  },
);
```

Use actual generated suite keys. Preserve IDs across moves, renames, pulls, and
edits; use a new ID for a different case. Describe the intent and expected outcomes
for QA. Do not claim assertions or checks that the implementation does not perform.
For complex tests, write descriptions and steps explicitly in the same annotations.

Review suitability for the intended shared environment separately from CI success.
Testron execution requires an explicit environment assignment; publishing never
selects one automatically. Use an appropriate dedicated authentication profile.
Do not embed account credentials or CI database setup into portable source.

## Pull, edit, push, run

`testron pull --test <id>` imports a Testron test with its ID and metadata. Set
`importDir` to a directory discovered by the repository's Playwright projects.
The generated fixture requires TESTRON_BASE_URL; profiled imports also require
TESTRON_STORAGE_STATE from local/CI login setup. Remote secrets are never pulled.
Credential variables referenced by steps must likewise be supplied locally.

Run the selected test with the repository's Playwright command. Inspect
`testron push -f <file> --dry-run --json`, then push within the user's authorized
scope. Inspect any catalogue downgrade. A portable push preserves the existing
Testron profile and environment bindings and updates editable steps. A downgrade
makes the source read-only and prevents Testron execution.

Pull before editing again after a UI change. Resolve revision/file conflicts
without overwriting unrelated local work. Commit stable IDs and generated references.
Publishing source and reporting test results are separate actions.

## Report local and CI runs

Install `@testron/cli` in the CI job and add `['@testron/cli/reporter']` alongside
existing Playwright reporters. Preserve the project's test environment, authentication
setup, and artifacts; check for `--reporter` overrides. Before a package release, CI
needs access to the built package archive rather than a laptop-only installation.

Use a reachable `server` in `testron.config.ts`; localhost in CI means the runner.
Configure the project API key as masked `TESTRON_API_KEY`, without logging it. Set
`TESTRON_REPORT_ENVIRONMENT_ID` (or config `reportEnvironmentId`) to an environment
UUID in that project. It labels results, not the Playwright target, and does not
grant remote run permission.

Keep test IDs, repositoryId, and generated suite references committed. On a fresh
checkout, establish the baseline for the published suites before running tests:

```sh
testron pull --tests --suite <suite-code-key>
# Repeat for other selected suites, then run the repository's Playwright command.
```

Use `--test <uuid>` for one test. Plain `testron pull` refreshes the catalog but does
not establish synchronized test revisions for the reporter. Successful push also
establishes a baseline in that checkout. Do not copy another project's state or
force source changes to bypass pull conflicts; reconcile the intended published
revision. Reporting setup does not authorize publishing changes by itself.

The reporter automatically uploads completed attempts for tests with `testron.id`.
A set `CI` variable labels them CI; otherwise they are repository-local. Reports
include status, duration, errors, revision, source hash, Playwright project, and retry.
Check reporting errors and resulting Runs entries before claiming upload success.
Missing configuration/revisions or upload failures fail the run. Skipped/interrupted
tests currently map to cancelled. Screenshots, videos, and traces are not uploaded;
keep existing CI artifacts. See the Playwright guide for the full CI setup example.

Documentation: https://testron.dev/docs/playwright
CLI reference: https://testron.dev/docs/cli
