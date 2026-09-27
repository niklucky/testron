# Quickstart

Create a Testron project, at least one suite in the web app.
Copy the project UUID from its URL. You need Node.js 22+ and @playwright/test
installed in your application repository.

The CLI is currently built from the Testron repository; npm publication is a
separate release step:

```sh
pnpm --filter @testron/cli build
cd packages/cli
npm pack
```

Install the resulting archive as a development dependency in your application:

```sh
npm install --save-dev /path/to/testron-cli-0.1.0.tgz
npx testron init --project <project-uuid> --agent
npx testron login --email developer@example.com
npx testron key create --name laptop
npx testron pull
```

Use --server http://127.0.0.1:4400 for a local Testron server, or your hosted server's
URL. Keep credentials out of testron.config.ts. The generated repositoryId is shared
by all checkouts: commit the configuration and testron.generated.ts.

```ts
import { test, expect } from '@playwright/test';
import { testron, suites } from '../../testron.generated';

test(
  'user can sign in',
  testron({ suite: suites.Authentication, publish: true, execution: 'ci-only' }),
  async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  },
);
```

Use the suite keys actually generated for your project. Run your Playwright test,
then publish it:

```sh
npx playwright test tests/e2e/auth.spec.ts
npx testron push -f tests/e2e/auth.spec.ts --dry-run
npx testron push -f tests/e2e/auth.spec.ts
```

The first push inserts a stable ID into the test declaration. Commit that edit.
Open the returned test URL to see its source and suite in Testron. Repeating an
unchanged push does not create another revision.

This example publishes a CI-only test for visibility. It needs no Testron environment
and cannot run against a Testron target. See the Playwright guide for explicit
ci-and-testron eligibility and importing tests for local/CI execution.
