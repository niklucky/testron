# CLI reference

Testron CLI 0.1.0 synchronizes Playwright source and metadata. Requires Node.js 22+
and an installed @playwright/test in the project. Remote execution is not included.

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
- `push`: collects all Playwright tests; `-f` selects one exact file. Validates suites,
  assigns missing IDs where safe, and uploads source and static local dependencies.
- `push --dry-run`: previews server validation without changing source or server data.
  New IDs shown by a preview are provisional; the real push assigns persistent IDs.
- `docs`: prints this version's reference; `docs --agent` prints the agent guide. `--help` and `--version` work offline.

All commands accept `--cwd <directory>`. Sync commands accept `--json`: success is
`{ "ok": true, "data": ... }`; errors are `{ "ok": false, "error": { "code", "message" } }`.
Exit status is 0 for success, 1 for operational/API errors, 2 for validation/conflicts.

Authentication uses TESTRON_API_KEY first, then a stored project key, then the stored
session. Credentials are stored with owner-only permissions under ~/.config/testron;
TESTRON_CONFIG_HOME overrides this directory. Keys only authorize sync for one project
and continue to enforce the issuing user's current project access.

Common error codes: SUITE_REQUIRED, SUITE_UNKNOWN, DUPLICATE_ID,
PARAMETER_ID_REQUIRED, DISCOVERY_FAILED, FILE_CONFLICT, TEST_CONFLICT, PULL_CONFLICT,
ENVIRONMENT_REQUIRED. Errors identify the missing annotation or conflicting resource.

If the project has exactly one environment it is selected automatically; otherwise
set environmentIds in testron.config.ts. Configuration also accepts playwrightConfig
and supportFiles (explicit repository-relative paths for non-imported text assets).
Do not add secrets, authentication state, or .env files to supportFiles.
