/**
 * Fixtures for the dashboard shell.
 *
 * Everything here is deterministic: the same seed produces the same numbers on
 * every reload, so a screenshot taken today matches one taken next week and a
 * layout bug never hides behind fresh random data. Swap this module for the
 * real repository when the runner starts reporting into it — the shapes in
 * ./types are what the UI depends on.
 */
import type {
  ActivityItem,
  DayRecord,
  Failure,
  RunStep,
  StepKind,
  SuiteRecord,
  TestRecord,
} from './types';

/** Small, fast, seedable PRNG — enough for fixtures, not for anything real. */
const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const failureBlueprints: (Omit<Failure, 'runId' | 'spark' | 'steps' | 'history'> & {
  flow: [StepKind, string][];
  failsAt: number;
})[] = [
  {
    id: 'f-1',
    signature: 'TimeoutError · locator.click',
    message:
      'locator.click: Timeout 15000ms exceeded.\n  waiting for getByTestId(\'checkout-submit\')\n  locator resolved to <button disabled data-testid="checkout-submit">Pay $128.40</button>\n  element is not enabled — retrying click action, attempt #24',
    test: 'Guest checkout completes with a saved card',
    file: 'checkout/guest.spec.ts:42',
    suite: 'Checkout',
    env: 'Production',
    browser: 'Chromium 131',
    owner: 'Anna Kim',
    ageMinutes: 14,
    occurrences: 12,
    kind: 'new',
    severity: 'critical',
    locator: "getByTestId('checkout-submit')",
    flow: [
      ['goto', '/cart'],
      ['click', 'Checkout as guest'],
      ['fill', 'Email · ada@lovelace.dev'],
      ['fill', 'Card number · 4242 4242 4242 4242'],
      ['click', 'Pay $128.40'],
      ['expect', 'the order confirmation is visible'],
    ],
    failsAt: 4,
  },
  {
    id: 'f-2',
    signature: 'expect(locator).toHaveText',
    message:
      'expect(locator).toHaveText(expected)\n  Locator: getByRole(\'heading\', { name: /order/i })\n  Expected string: "Order #1042 confirmed"\n  Received string: "Order # confirmed"\n  Call log: waiting for locator — 8 retries over 5000ms',
    test: 'Order number appears on the confirmation screen',
    file: 'checkout/confirmation.spec.ts:88',
    suite: 'Checkout',
    env: 'Staging',
    browser: 'WebKit 18',
    owner: 'Mateo Ortiz',
    ageMinutes: 51,
    occurrences: 4,
    kind: 'known',
    severity: 'serious',
    locator: "getByRole('heading', { name: /order/i })",
    flow: [
      ['goto', '/checkout/confirmation?order=1042'],
      ['wait', 'GET /api/orders/1042'],
      ['expect', 'the heading reads “Order #1042 confirmed”'],
      ['expect', 'the receipt total reads “$128.40”'],
    ],
    failsAt: 2,
  },
  {
    id: 'f-3',
    signature: 'Error · strict mode violation',
    message:
      'locator.fill: Error: strict mode violation\n  getByPlaceholder(\'Search\') resolved to 3 elements:\n    1) <input placeholder="Search" class="header-search">\n    2) <input placeholder="Search" class="drawer-search">\n    3) <input placeholder="Search" aria-hidden="true">',
    test: 'Catalog search returns matching products',
    file: 'catalog/search.spec.ts:17',
    suite: 'Product catalog',
    env: 'Production',
    browser: 'Chromium 131',
    owner: 'Jamie Song',
    ageMinutes: 96,
    occurrences: 7,
    kind: 'known',
    severity: 'serious',
    locator: "getByPlaceholder('Search')",
    flow: [
      ['goto', '/products'],
      ['fill', 'Search · running shoes'],
      ['click', 'Search'],
      ['expect', 'at least 5 result cards are listed'],
    ],
    failsAt: 1,
  },
  {
    id: 'f-4',
    signature: 'Error · element intercepts pointer events',
    message:
      'locator.click: Error: element is not clickable\n  <div class="cookie-banner"> from <body> intercepts pointer events\n  retrying click action — waited 10000ms for the overlay to detach',
    test: 'Sign in with an existing account',
    file: 'auth/sign-in.spec.ts:23',
    suite: 'Authentication',
    env: 'Preview',
    browser: 'Firefox 133',
    owner: 'Anna Kim',
    ageMinutes: 132,
    occurrences: 21,
    kind: 'flaky',
    severity: 'critical',
    locator: "getByRole('button', { name: 'Sign in' })",
    flow: [
      ['goto', '/sign-in'],
      ['fill', 'Email · qa+ci@testron.dev'],
      ['fill', 'Password · ••••••••'],
      ['click', 'Sign in'],
      ['expect', 'the account menu is visible'],
    ],
    failsAt: 3,
  },
  {
    id: 'f-5',
    signature: 'TimeoutError · page.waitForResponse',
    message:
      'page.waitForResponse: Timeout 20000ms exceeded while waiting for POST /api/payments/authorize\n  last matching request finished 20.3s ago with status 502',
    test: 'Wallet payment authorises within 20s',
    file: 'payments/wallet.spec.ts:64',
    suite: 'Payments',
    env: 'Staging',
    browser: 'Chromium 131',
    owner: 'Priya Raman',
    ageMinutes: 168,
    occurrences: 3,
    kind: 'new',
    severity: 'critical',
    locator: "page.waitForResponse('**/payments/authorize')",
    flow: [
      ['goto', '/checkout'],
      ['click', 'Pay with wallet'],
      ['wait', 'POST /api/payments/authorize'],
      ['expect', 'the receipt screen is visible'],
    ],
    failsAt: 2,
  },
  {
    id: 'f-6',
    signature: 'expect(page).toHaveURL',
    message:
      'expect(page).toHaveURL(expected)\n  Expected pattern: /\\/account$/\n  Received string: "/sign-in?redirect=%2Faccount&r=3"\n  The app bounced through 3 redirects before settling.',
    test: 'Session survives a hard reload',
    file: 'auth/session.spec.ts:110',
    suite: 'Authentication',
    env: 'Production',
    browser: 'WebKit 18',
    owner: 'Mateo Ortiz',
    ageMinutes: 214,
    occurrences: 2,
    kind: 'flaky',
    severity: 'warning',
    locator: 'page',
    flow: [
      ['goto', '/account'],
      ['expect', 'the profile card is visible'],
      ['click', 'Reload'],
      ['expect', 'the URL is still /account'],
    ],
    failsAt: 3,
  },
  {
    id: 'f-7',
    signature: 'expect(locator).toBeChecked',
    message:
      "expect(locator).toBeChecked()\n  Locator: getByLabel('Weekly digest')\n  Expected: checked\n  Received: unchecked\n  The preference silently reverts after the save request returns 204.",
    test: 'Notification preferences persist after save',
    file: 'account/notifications.spec.ts:31',
    suite: 'Account',
    env: 'Staging',
    browser: 'Chromium 131',
    owner: 'Priya Raman',
    ageMinutes: 302,
    occurrences: 5,
    kind: 'known',
    severity: 'warning',
    locator: "getByLabel('Weekly digest')",
    flow: [
      ['goto', '/account/notifications'],
      ['check', 'Weekly digest'],
      ['click', 'Save preferences'],
      ['wait', 'PATCH /api/preferences'],
      ['expect', 'the Weekly digest toggle is still on'],
    ],
    failsAt: 4,
  },
  {
    id: 'f-8',
    signature: 'Test timeout of 30000ms exceeded',
    message:
      'Test timeout of 30000ms exceeded while running the onboarding tour.\n  Pending action: locator.click(getByRole("button", { name: "Next" }))\n  The tour re-mounts on every step, discarding the handle.',
    test: 'Onboarding tour can be completed end to end',
    file: 'onboarding/tour.spec.ts:9',
    suite: 'Onboarding',
    env: 'Preview',
    browser: 'Firefox 133',
    owner: 'Jamie Song',
    ageMinutes: 388,
    occurrences: 9,
    kind: 'flaky',
    severity: 'serious',
    locator: "getByRole('button', { name: 'Next' })",
    flow: [
      ['goto', '/welcome'],
      ['click', 'Start the tour'],
      ['click', 'Next'],
      ['click', 'Next'],
      ['expect', 'the tour finishes on the dashboard'],
    ],
    failsAt: 2,
  },
  {
    id: 'f-9',
    signature: 'net::ERR_CONNECTION_REFUSED',
    message:
      'page.goto: net::ERR_CONNECTION_REFUSED at https://staging.shop.internal/reports\n  The reports service was redeployed 4 minutes before this run started.',
    test: 'Sales report exports as CSV',
    file: 'back-office/reports.spec.ts:52',
    suite: 'Back office',
    env: 'Staging',
    browser: 'Chromium 131',
    owner: 'Nikita S.',
    ageMinutes: 470,
    occurrences: 1,
    kind: 'new',
    severity: 'warning',
    locator: 'page.goto',
    flow: [
      ['goto', '/reports'],
      ['select', 'Range · Last 30 days'],
      ['click', 'Export CSV'],
      ['expect', 'the download completes'],
    ],
    failsAt: 0,
  },
];

const stepCall: Record<StepKind, string> = {
  goto: 'page.goto',
  click: 'locator.click',
  fill: 'locator.fill',
  select: 'locator.selectOption',
  check: 'locator.check',
  wait: 'page.waitForResponse',
  expect: 'expect(locator)',
};

/** The same action, written for someone holding a mouse instead of a runner. */
const manualPhrase = (kind: StepKind, target: string): { manual: string; expected: string } => {
  const [field, value] = target.split(' · ');
  switch (kind) {
    case 'goto':
      return { manual: `Open ${target}`, expected: 'The page finishes loading' };
    case 'click':
      return { manual: `Click “${target}”`, expected: 'The control reacts within a second' };
    case 'fill':
      return {
        manual: `Type “${value}” into ${field}`,
        expected: `${field} shows exactly what you typed`,
      };
    case 'select':
      return { manual: `Choose “${value}” in ${field}`, expected: `${field} shows “${value}”` };
    case 'check':
      return { manual: `Tick “${target}”`, expected: 'The box stays ticked' };
    case 'wait':
      return { manual: `Wait for ${target} to come back`, expected: 'No spinner is left behind' };
    default:
      return {
        manual: `Check that ${target}`,
        expected: `${target[0].toUpperCase()}${target.slice(1)}`,
      };
  }
};

export const failures: Failure[] = failureBlueprints.map(
  ({ flow, failsAt, ...blueprint }, index) => {
    const random = mulberry32(101 + index * 37);
    const steps: RunStep[] = flow.map(([kind, target], stepIndex) => ({
      id: `${blueprint.id}-s${stepIndex}`,
      call: stepCall[kind],
      target,
      ...manualPhrase(kind, target),
      ms:
        stepIndex === failsAt
          ? 15_000 + Math.round(random() * 5_000)
          : stepIndex > failsAt
            ? 0
            : 120 + Math.round(random() * 1_400),
      state: stepIndex === failsAt ? 'failed' : stepIndex < failsAt ? 'passed' : 'skipped',
    }));
    return {
      ...blueprint,
      runId: `run_${(0x4a0f + index * 733).toString(16)}`,
      steps,
      spark: Array.from({ length: 7 }, (_, day) =>
        Math.max(0, Math.round(random() * blueprint.occurrences * (day > 3 ? 0.9 : 0.45))),
      ),
      history: Array.from({ length: 24 }, (_, run) => {
        const roll = random();
        if (run > 20) return 'failed';
        if (blueprint.kind === 'flaky')
          return roll < 0.34 ? 'failed' : roll < 0.42 ? 'flaky' : 'passed';
        return roll < 0.14 ? 'failed' : roll < 0.18 ? 'skipped' : 'passed';
      }),
    };
  },
);

const suiteBlueprints: { name: string; owner: string; tests: string[] }[] = [
  {
    name: 'Checkout',
    owner: 'Anna Kim',
    tests: [
      'Guest checkout completes with a saved card',
      'Order number appears on the confirmation screen',
      'Promo code applies a discount',
      'Tax is calculated per region',
      'Cart survives sign-in',
      'Address validation rejects a bad ZIP',
      'Express wallet payment',
    ],
  },
  {
    name: 'Authentication',
    owner: 'Mateo Ortiz',
    tests: [
      'Sign in with an existing account',
      'Session survives a hard reload',
      'Create an account',
      'Reset a password',
      'Two-factor challenge',
      'Sign out clears the session',
    ],
  },
  {
    name: 'Product catalog',
    owner: 'Jamie Song',
    tests: [
      'Catalog search returns matching products',
      'Facet filters narrow the list',
      'Sort by price',
      'Gallery zoom',
      'Out-of-stock badge',
    ],
  },
  {
    name: 'Payments',
    owner: 'Priya Raman',
    tests: [
      'Wallet payment authorises within 20s',
      'Card entry validates the number',
      '3-D Secure challenge',
      'Receipt screen shows the total',
      'Refund request is queued',
    ],
  },
  {
    name: 'Account',
    owner: 'Priya Raman',
    tests: [
      'Notification preferences persist after save',
      'Update the profile',
      'Change the password',
      'Saved addresses',
      'Delete the account',
    ],
  },
  {
    name: 'Onboarding',
    owner: 'Jamie Song',
    tests: [
      'Onboarding tour can be completed end to end',
      'Welcome carousel',
      'Permission prompt',
      'Skip flow',
    ],
  },
  {
    name: 'Back office',
    owner: 'Nikita S.',
    tests: ['Sales report exports as CSV', 'Create a discount', 'Refund an order'],
  },
];

export const buildSuites = (): SuiteRecord[] => {
  const random = mulberry32(4_242);
  return suiteBlueprints.map((blueprint, suiteIndex) => {
    const lastRunMinutesAgo = Math.round((8 + random() * 60) * (suiteIndex + 1) ** 1.2);
    return {
      id: `suite-${suiteIndex}`,
      name: blueprint.name,
      owner: blueprint.owner,
      lastRunMinutesAgo,
      tests: blueprint.tests.map((name, testIndex): TestRecord => {
        const failure = failures.find((candidate) => candidate.test === name);
        const roll = random();
        return {
          id: `suite-${suiteIndex}-t${testIndex}`,
          name,
          status: failure ? 'failed' : roll < 0.1 ? 'skipped' : 'passed',
          minutesAgo: lastRunMinutesAgo + Math.round(random() * 20),
          seconds: 5 + Math.round(random() * 90),
          failureId: failure?.id,
        };
      }),
    };
  });
};

export const tally = (suite: SuiteRecord) => ({
  passed: suite.tests.filter((test) => test.status === 'passed').length,
  failed: suite.tests.filter((test) => test.status === 'failed').length,
  skipped: suite.tests.filter((test) => test.status === 'skipped').length,
});

export const passRateOf = (suite: SuiteRecord) => {
  const { passed, failed } = tally(suite);
  return (passed / Math.max(1, passed + failed)) * 100;
};

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86_400_000;

const dayRandom = mulberry32(777);

export const days: DayRecord[] = (() => {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(midnight.getTime() - (29 - index) * DAY_MS);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const total = Math.max(6, Math.round((26 + dayRandom() * 22) * (weekend ? 0.34 : 1)));
    const failed = Math.round(total * (0.01 + dayRandom() * 0.09));
    const skipped = Math.round(total * (0.01 + dayRandom() * 0.05));
    return {
      key: date.toISOString().slice(0, 10),
      weekday: weekdayNames[date.getDay()],
      dayOfMonth: date.getDate(),
      passed: total - failed - skipped,
      skipped,
      failed,
    };
  });
})();

export const activity: ActivityItem[] = [
  {
    id: 'a1',
    kind: 'updated',
    test: 'Guest checkout completes with a saved card',
    suite: 'Checkout',
    author: 'Anna Kim',
    minutesAgo: 18,
  },
  {
    id: 'a2',
    kind: 'added',
    test: 'Express wallet payment',
    suite: 'Checkout',
    author: 'Mateo Ortiz',
    minutesAgo: 64,
  },
  {
    id: 'a3',
    kind: 'recorded',
    test: '3-D Secure challenge',
    suite: 'Payments',
    author: 'Priya Raman',
    minutesAgo: 122,
  },
  {
    id: 'a4',
    kind: 'fixed',
    test: 'Sort by price',
    suite: 'Product catalog',
    author: 'Jamie Song',
    minutesAgo: 240,
  },
  {
    id: 'a5',
    kind: 'updated',
    test: 'Two-factor challenge',
    suite: 'Authentication',
    author: 'Nikita S.',
    minutesAgo: 361,
  },
  {
    id: 'a6',
    kind: 'added',
    test: 'Refund request is queued',
    suite: 'Payments',
    author: 'Anna Kim',
    minutesAgo: 700,
  },
];

const pulseRandom = mulberry32(9_001);

export const pulse = suiteBlueprints.map((blueprint, index) => ({
  id: `pulse-${index}`,
  label: blueprint.name,
  values: Array.from({ length: 14 }, (_, day) => {
    const quiet = pulseRandom();
    const magnitude = pulseRandom();
    const weekendish = day % 7 === 5 || day % 7 === 6;
    return quiet < (weekendish ? 0.85 : 0.58) ? 0 : Math.ceil(magnitude ** 2 * 8);
  }),
}));

export const owners = [
  { name: 'Anna Kim', open: 8 },
  { name: 'Mateo Ortiz', open: 6 },
  { name: 'Priya Raman', open: 5 },
  { name: 'Jamie Song', open: 3 },
  { name: 'Unassigned', open: 2 },
];
