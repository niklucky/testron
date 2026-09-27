# Playwright integration

Import suites and testron from the generated module. These references are plain
TypeScript and return native Playwright annotations. No Testron runtime wrapper
replaces your test function or fixtures.

```ts
test.describe('Password login', testron({ suite: suites.Authentication }), () => {
  test(
    'valid credentials',
    testron({ id: '8efdb17c-266e-4a34-aebc-05b6b27dd418' }),
    async ({ page }) => {
      // Implementation
    },
  );
});
```

The nearest annotated describe supplies the suite unless the test overrides it.
Several describes and files can belong to one Testron suite. Source breadcrumbs
retain the finer Playwright hierarchy. A missing or deleted suite fails push.

Suite code keys are stored on the server and survive display-name changes. Existing
suites receive UUID-derived keys during migration; new suites receive a key derived
from their initial name. Pull regenerates the constant map and SuiteId union.

Test IDs identify logical cases. Keep an ID when renaming or moving a test; use a new
ID when copying it into a distinct case. Browser projects and repetitions share the
same logical ID. Parameterized cases need a stable explicit ID in each data row.
Do not generate IDs randomly while collecting tests, and do not put IDs on describes.

The CLI can add an ID to a normal test declaration, a literal details object, or a
call to testron with literal options. Computed options and generated cases require
explicit IDs. Runtime-only annotations inside test bodies cannot be discovered.

Discovery uses your project's installed Playwright and configuration with --list.
It evaluates configuration and test modules, but does not run test bodies. It does
not convert arbitrary source into recorded steps or make it remotely executable.
