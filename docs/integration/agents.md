# Testron agent workflow

Read `testron --help` and `testron docs` for the installed CLI version. The project
configuration is `testron.config.ts`; credentials belong in TESTRON_API_KEY or the
user's credential store, never in source code.

1. Run `testron pull --json` to refresh typed suite references and the test catalog.
2. Read `.testron/catalog.json` for test IDs, suite IDs, requests and descriptions.
3. Import `testron` and `suites` from the generated `testron.generated.ts` module.
   Annotate each test or enclosing describe with a suite. Preserve existing test IDs.
   A distinct test needs a distinct ID; generated cases need an explicit ID per case.
4. Implement and run the relevant Playwright tests using this repository's tooling.
5. When asked to publish, run `testron push -f <spec> --dry-run --json`, inspect the
   result, then run `testron push -f <spec> --json`. Push may add missing IDs to source;
   commit those IDs with the test. Do not repeatedly push a conflicting revision.
6. Resolve errors by their code and file location. Pull never authorizes discarding
   local work. Never delete or overwrite unrelated tests to resolve a conflict.

`testron pull --test <id>` downloads available source context for a test. Requests
without implementations are saved to `.testron/requests.json`, not passing stubs.
Do not edit generated references. Tests are source snapshots in Testron; run them in
their original Playwright project. MCP is not required for this workflow.
