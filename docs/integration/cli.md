# CLI reference

Testron CLI 0.1.0 synchronizes Playwright source and metadata. Requires Node.js 22+
and an installed @playwright/test in the project. Portable tests use Testron's existing editor and runner; CI catalogue tests are read-only.

```sh
testron init --project <project-uuid> --agent
testron login --email developer@example.com
testron key create --name laptop
testron pull
testron push -f tests/e2e/auth.spec.ts --dry-run
testron push -f tests/e2e/auth.spec.ts
```

- `init`: writes configuration and empty typed references. `--server` defaults to
  https://app.testron.dev. `--environment <uuid>` is repeatable. `--repository <uuid>`
  connects another checkout to an existing repository. Commit that configuration.
- `login`: prompts for a password without echoing it. In automation use
  `--password-stdin`. Stores the expiring session outside the repository.
- `key create`: creates and saves a project-scoped API key. `--days` defaults to 90
  and accepts 1–365. `key revoke --id <uuid>` requires the account login session.
- `pull`: refreshes suite references and `.testron/catalog.json`. Does not overwrite
  test source or advance source synchronization baselines.
- `pull --tests`: also downloads source. `--test <uuid>` selects a test and implies
  source download. `--suite <codeKey|uuid>` filters the catalog; add `--tests` for source.
- `push`: discovers Playwright tests and selects only `publish: true` tests; `-f`
  narrows to one exact file. Validates suites,
  assigns missing IDs where safe, and uploads selected spec source and QA metadata without dependency bundles.
- `push --dry-run`: previews server validation without changing source or server data.
  New IDs shown by a preview are provisional; the real push assigns persistent IDs.
- `docs`: prints this version's reference; `docs --agent` prints the agent guide; `docs --skill` prints the authoring skill. `--help` and `--version` work offline.

All commands accept `--cwd <directory>`. Sync commands accept `--json`: success is
`{ "ok": true, "data": ... }`; errors are `{ "ok": false, "error": { "code", "message" } }`.
Exit status is 0 for success, 1 for operational/API errors, 2 for validation/conflicts.

Authentication uses TESTRON_API_KEY first, then a stored project key, then the stored
session. Credentials are stored with owner-only permissions under ~/.config/testron;
TESTRON_CONFIG_HOME overrides this directory. Keys only authorize sync for one project
and continue to enforce the issuing user's current project access.

Common error codes: SUITE_REQUIRED, SUITE_UNKNOWN, DUPLICATE_ID,
PARAMETER_ID_REQUIRED, DISCOVERY_FAILED, FILE_CONFLICT, TEST_CONFLICT, PULL_CONFLICT,
NO_PUBLISHED_TESTS, INVALID_PUBLICATION, INVALID_EXECUTION, SOURCE_EXPORT_UNSUPPORTED. Errors identify the missing annotation or conflicting resource.

New repository tests have no remote environments by default. Set environmentIds in
testron.config.ts to explicitly assign eligible tests. CI-only tests ignore those
assignments and cannot run on Testron environments. Existing eligible bindings are
preserved when no new assignments are supplied. Configuration also accepts
playwrightConfig, importDir (default tests/testron, must be matched by your Playwright
configuration), and reportEnvironmentId (the reporting environment for local/CI results).
The legacy supportFiles field is accepted for compatibility but no longer uploaded.
Do not add secrets, authentication state, or .env files to supportFiles.

Generated annotations accept publish (boolean) and execution ('ci-only' or
'ci-and-testron'). Publication defaults to false; execution defaults to ci-only.
Both inherit from describes, with the closest annotation winning. A file filter
does not override these settings. Run testron pull to refresh the generated types.

Pulled structured Testron tests include a local fixture. Set TESTRON_BASE_URL and,
for profiled tests, TESTRON_STORAGE_STATE from your CI login setup. Pull does not
export remote credentials or silently reuse remote URLs. Custom code or multi-origin
navigation requires explicit adaptation. Portable imported tests stay editable and runnable after push. Helper or setup
dependencies downgrade them to read-only CI catalogue tests. Add @testron/cli/reporter
to report local/CI outcomes; see the Playwright guide for reporting configuration.

## CI run reporting

`testron push` publishes definitions. The `@testron/cli/reporter` Playwright reporter
uploads results automatically. Add it alongside existing reporters, provide a
reachable configured server, a masked `TESTRON_API_KEY`, and
`TESTRON_REPORT_ENVIRONMENT_ID` (or config `reportEnvironmentId`).

On fresh checkouts, use `testron pull --tests --suite <codeKey>` for each selected
published suite, or `testron pull --test <uuid>`, before running Playwright. Plain
`pull` does not establish the synchronized revision baseline required by the reporter.
Keep IDs and repository configuration committed, and resolve source conflicts before
running the pipeline. Only tests with `testron.id` are reported. Reporting errors fail
the run; local/CI screenshots, videos, and traces remain in CI artifacts.

See the [Playwright reporting guide](https://testron.dev/docs/playwright) for package
installation, CI variables, and a GitLab job example.
