import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

/* ------------------------------------------------------------------ icons */

const iconPaths = {
  overview: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </>
  ),
  suite: (
    <>
      <path d="M9.5 3v6.2L4.8 17a2.8 2.8 0 0 0 2.4 4.2h9.6a2.8 2.8 0 0 0 2.4-4.2l-4.7-7.8V3" />
      <path d="M8 3h8M7.2 14.5h9.6" />
    </>
  ),
  test: (
    <>
      <path d="M6 3h7.5L18 7.4V21H6z" />
      <path d="M13 3v5h5" />
      <path d="m9 14.6 1.9 1.9L15 12.4" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  chevron: <path d="m9.5 18 6-6-6-6" />,
  caret: <path d="m6 9.5 6 6 6-6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.2 12a7 7 0 0 0-.1-1.1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.9-1.1L14.5 3.3h-4L10.2 6a8 8 0 0 0-1.9 1.1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.1l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.9 1.1l.3 2.6h4l.3-2.6a8 8 0 0 0 1.9-1.1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1.1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 6.6-2.5 8.5h17c0-1.9-2.5-2-2.5-8.5" />
      <path d="M10.2 20.5h3.6" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="m5 12.8 4.6 4.6L19 6.6" />,
  close: <path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  play: <path d="M8.5 5.6 18 12l-9.5 6.4Z" />,
  pencil: (
    <>
      <path d="M4.5 19.5h3.2L19 8.2a2.3 2.3 0 0 0-3.2-3.2L4.5 16.3Z" />
      <path d="m14.6 6.2 3.2 3.2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.4 21 20H3Z" />
      <path d="M12 10.4v4.2M12 17.6v.2" />
    </>
  ),
  filter: (
    <>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </>
  ),
  arrowUp: <path d="M12 19V5.6M6.4 11.2 12 5.6l5.6 5.6" />,
  arrowDown: <path d="M12 5v13.4M17.6 12.8 12 18.4l-5.6-5.6" />,
} satisfies Record<string, ReactNode>;

type IconName = keyof typeof iconPaths;

const Icon = ({
  name,
  size = 16,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {iconPaths[name]}
  </svg>
);

/* ------------------------------------------------------------ sample data */

type TestStatus = 'passed' | 'failed' | 'skipped';

type TestRecord = {
  id: string;
  name: string;
  status: TestStatus;
  minutesAgo: number;
  seconds: number;
};

type SuiteRecord = {
  id: string;
  name: string;
  owner: string;
  tests: TestRecord[];
  passed: number;
  failed: number;
  skipped: number;
  lastRunMinutesAgo: number;
};

type DayRecord = {
  key: string;
  weekday: string;
  dayOfMonth: number;
  passed: number;
  failed: number;
  skipped: number;
};

type ActivityKind = 'added' | 'updated' | 'recorded' | 'fixed';

type ActivityRecord = {
  id: string;
  kind: ActivityKind;
  test: string;
  suite: string;
  author: string;
  minutesAgo: number;
};

type ProjectRecord = {
  id: string;
  name: string;
  initials: string;
  swatch: string;
  environment: string;
  suites: SuiteRecord[];
  days: DayRecord[];
  activity: ActivityRecord[];
  totals: {
    tests: number;
    testsAdded: number;
    passRate: number;
    passRateDelta: number;
    runs: number;
    runsDelta: number;
    failing: number;
    flaky: number;
    seconds: number;
    secondsDelta: number;
    changesThisWeek: number;
  };
};

const blueprints = [
  {
    id: 'commerce',
    name: 'Commerce app',
    initials: 'CA',
    swatch: 'bg-[#dfd2f4] text-[#4b3b74]',
    environment: 'Production',
    seed: 12,
    suites: [
      {
        name: 'Checkout',
        owner: 'Anna Kim',
        tests: [
          'Guest checkout',
          'Saved card payment',
          'Promo code applies discount',
          'Tax is calculated per region',
          'Order confirmation email',
          'Cart survives sign-in',
          'Address validation',
          'Express wallet payment',
        ],
      },
      {
        name: 'Authentication',
        owner: 'Mateo Ortiz',
        tests: [
          'Sign in with password',
          'Create account',
          'Reset password',
          'Session expiry',
          'Two-factor challenge',
          'Sign in with Google',
          'Sign out clears session',
        ],
      },
      {
        name: 'Product catalog',
        owner: 'Jamie Song',
        tests: [
          'Search returns results',
          'Facet filters narrow list',
          'Sort by price',
          'Gallery zoom',
          'Out-of-stock badge',
          'Related products',
        ],
      },
      {
        name: 'Cart',
        owner: 'Anna Kim',
        tests: [
          'Add to cart',
          'Update quantity',
          'Remove line item',
          'Cart badge count',
          'Empty cart state',
        ],
      },
      {
        name: 'Account',
        owner: 'Priya Raman',
        tests: [
          'Update profile',
          'Change password',
          'Notification preferences',
          'Saved addresses',
          'Delete account',
        ],
      },
      {
        name: 'Back office',
        owner: 'Nikita S.',
        tests: ['Create discount', 'Refund an order', 'Export sales report'],
      },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing site',
    initials: 'MS',
    swatch: 'bg-[#c9e4e5] text-[#2f5a5c]',
    environment: 'Staging',
    seed: 27,
    suites: [
      {
        name: 'Landing page',
        owner: 'Jamie Song',
        tests: [
          'Hero renders',
          'Pricing toggle',
          'Testimonial carousel',
          'Cookie banner',
          'Newsletter signup',
        ],
      },
      {
        name: 'Navigation',
        owner: 'Mateo Ortiz',
        tests: ['Main menu', 'Mobile menu', 'Footer links', 'Breadcrumbs'],
      },
      {
        name: 'Blog',
        owner: 'Priya Raman',
        tests: [
          'Article list',
          'Article detail',
          'Tag filter',
          'Share buttons',
          'Related posts',
          'RSS feed',
        ],
      },
      {
        name: 'Contact forms',
        owner: 'Anna Kim',
        tests: ['Demo request', 'Support form', 'Validation errors', 'Spam guard'],
      },
      {
        name: 'SEO & meta',
        owner: 'Nikita S.',
        tests: ['Sitemap is served', 'Meta tags', 'Structured data'],
      },
    ],
  },
  {
    id: 'mobile',
    name: 'Mobile web',
    initials: 'MW',
    swatch: 'bg-[#cfdcf3] text-[#33487a]',
    environment: 'Preview',
    seed: 41,
    suites: [
      {
        name: 'Onboarding',
        owner: 'Priya Raman',
        tests: ['Welcome carousel', 'Permission prompt', 'Account setup', 'Skip flow'],
      },
      {
        name: 'Navigation',
        owner: 'Jamie Song',
        tests: ['Tab bar', 'Deep link opens screen', 'Back gesture', 'Offline banner'],
      },
      {
        name: 'Payments',
        owner: 'Mateo Ortiz',
        tests: [
          'Wallet payment',
          'Card entry',
          '3-D Secure challenge',
          'Receipt screen',
          'Refund request',
        ],
      },
      {
        name: 'Notifications',
        owner: 'Anna Kim',
        tests: ['Push opt-in', 'In-app inbox', 'Badge count'],
      },
      {
        name: 'Profile',
        owner: 'Nikita S.',
        tests: ['Avatar upload', 'Edit details', 'Dark mode toggle'],
      },
    ],
  },
] as const;

const authors = ['Anna Kim', 'Mateo Ortiz', 'Jamie Song', 'Priya Raman', 'Nikita S.'] as const;

const activityKinds: ActivityKind[] = ['added', 'updated', 'recorded', 'fixed', 'updated', 'added'];

const DAY_MS = 86_400_000;
const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Deterministic PRNG so the mock workspace looks the same on every render. */
const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const buildProject = (blueprint: (typeof blueprints)[number]): ProjectRecord => {
  const random = mulberry32(blueprint.seed);
  const between = (min: number, max: number) => min + random() * (max - min);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const suites: SuiteRecord[] = blueprint.suites.map((suite, suiteIndex) => {
    const lastRunMinutesAgo = Math.round(between(7, 75) * (suiteIndex + 1) ** 1.35);
    const tests: TestRecord[] = suite.tests.map((name, testIndex) => {
      const roll = random();
      const status: TestStatus = roll < 0.055 ? 'failed' : roll < 0.12 ? 'skipped' : 'passed';
      return {
        id: `${blueprint.id}-${suiteIndex}-${testIndex}`,
        name,
        status,
        minutesAgo: lastRunMinutesAgo + Math.round(between(0, 25)),
        seconds: Math.round(between(6, 96)),
      };
    });
    return {
      id: `${blueprint.id}-${suiteIndex}`,
      name: suite.name,
      owner: suite.owner,
      tests,
      passed: tests.filter((test) => test.status === 'passed').length,
      failed: tests.filter((test) => test.status === 'failed').length,
      skipped: tests.filter((test) => test.status === 'skipped').length,
      lastRunMinutesAgo,
    };
  });

  const allTests = suites.flatMap((suite) => suite.tests);
  const days: DayRecord[] = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(midnight.getTime() - (29 - index) * DAY_MS);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const total = Math.max(
      4,
      Math.round(allTests.length * between(0.6, 1.25) * (weekend ? 0.32 : 1)),
    );
    const failed = Math.round(total * between(0.01, 0.09));
    const skipped = Math.round(total * between(0.01, 0.07));
    return {
      key: date.toISOString().slice(0, 10),
      weekday: weekdayNames[date.getDay()],
      dayOfMonth: date.getDate(),
      passed: total - failed - skipped,
      failed,
      skipped,
    };
  });

  const activity: ActivityRecord[] = activityKinds
    .map((kind, index) => {
      const suite = suites[Math.floor(random() * suites.length)];
      const test = suite.tests[Math.floor(random() * suite.tests.length)];
      return {
        id: `${blueprint.id}-activity-${index}`,
        kind,
        test: test.name,
        suite: suite.name,
        author: authors[Math.floor(random() * authors.length)],
        minutesAgo: Math.round(between(4, 40) * (index + 1) ** 1.6),
      };
    })
    .sort((a, b) => a.minutesAgo - b.minutesAgo);

  const passed = suites.reduce((sum, suite) => sum + suite.passed, 0);
  const failed = suites.reduce((sum, suite) => sum + suite.failed, 0);
  const runs = days.reduce((sum, day) => sum + day.passed + day.failed + day.skipped, 0);

  return {
    id: blueprint.id,
    name: blueprint.name,
    initials: blueprint.initials,
    swatch: blueprint.swatch,
    environment: blueprint.environment,
    suites,
    days,
    activity,
    totals: {
      tests: allTests.length,
      testsAdded: Math.round(between(5, 18)),
      passRate: (passed / Math.max(1, passed + failed)) * 100,
      passRateDelta: between(-1.4, 3.6),
      runs,
      runsDelta: between(-7, 24),
      failing: failed,
      flaky: Math.round(between(1, 5)),
      seconds: Math.round(
        allTests.reduce((sum, test) => sum + test.seconds, 0) / Math.max(1, allTests.length),
      ),
      secondsDelta: between(-16, 7),
      changesThisWeek: Math.round(between(12, 38)),
    },
  };
};

const projects = blueprints.map(buildProject);

/* -------------------------------------------------------------- formatting */

const shortAge = (minutes: number) =>
  minutes < 60
    ? `${Math.max(1, Math.round(minutes))}m`
    : minutes < 1440
      ? `${Math.round(minutes / 60)}h`
      : `${Math.round(minutes / 1440)}d`;

const longAge = (minutes: number) =>
  minutes < 60
    ? `${Math.max(1, Math.round(minutes))} min ago`
    : minutes < 1440
      ? `${Math.round(minutes / 60)} hr ago`
      : `${Math.round(minutes / 1440)} days ago`;

const duration = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

const signed = (value: number, digits = 1) =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;

/* ------------------------------------------------------------------ atoms */

const statusTone: Record<TestStatus, { dot: string; bar: string; chip: string; label: string }> = {
  passed: {
    dot: 'bg-[#5f9d7d]',
    bar: 'bg-[#6ba98a]',
    chip: 'bg-[#e8f1ea] text-[#3d7a5c]',
    label: 'Passed',
  },
  failed: {
    dot: 'bg-[#c85c4c]',
    bar: 'bg-[#cd6353]',
    chip: 'bg-[#fae9e5] text-[#ab4132]',
    label: 'Failed',
  },
  skipped: {
    dot: 'bg-[#c3bdaf]',
    bar: 'bg-[#cdc7b9]',
    chip: 'bg-[#efece3] text-[#7d786d]',
    label: 'Skipped',
  },
};

const HealthBar = ({
  passed,
  skipped,
  failed,
  className = '',
}: {
  passed: number;
  skipped: number;
  failed: number;
  className?: string;
}) => {
  const total = Math.max(1, passed + skipped + failed);
  return (
    <span className={`flex h-[4px] overflow-hidden rounded-full bg-[#e6e2d6] ${className}`}>
      {(
        [
          ['passed', passed],
          ['skipped', skipped],
          ['failed', failed],
        ] as const
      ).map(([status, value]) => (
        <span
          key={status}
          className={statusTone[status].bar}
          style={{ width: `${(value / total) * 100}%` }}
        />
      ))}
    </span>
  );
};

const Trend = ({
  value,
  unit,
  digits = 1,
  goodWhenUp = true,
}: {
  value: number;
  unit: string;
  digits?: number;
  goodWhenUp?: boolean;
}) => {
  const good = goodWhenUp ? value >= 0 : value <= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-[3px] text-[11px] font-semibold tabular-nums ${
        good ? 'bg-[#e8f1ea] text-[#3d7a5c]' : 'bg-[#fae9e5] text-[#ab4132]'
      }`}
    >
      <Icon name={value >= 0 ? 'arrowUp' : 'arrowDown'} size={10} className="stroke-[2.4]" />
      {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  );
};

const Panel = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section
    className={`rounded-xl border border-[#e6e1d4] bg-white shadow-[0_1px_1px_rgba(60,52,38,.03)] ${className}`}
  >
    {children}
  </section>
);

const PanelHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 border-b border-[#efece2] px-4 py-3">
    <div>
      <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#2b2922]">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[12px] text-[#96907f]">{subtitle}</p>}
    </div>
    {action}
  </div>
);

/* ---------------------------------------------------------------- sidebar */

const SuiteItem = ({ suite }: { suite: SuiteRecord }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = expanded ? suite.tests.slice(0, showAll ? undefined : 5) : [];
  const hidden = suite.tests.length - 5;

  return (
    <li>
      <div
        className={`group flex items-center gap-0.5 rounded-lg pr-1 transition-colors hover:bg-[#e4e0d2] ${
          expanded ? 'bg-[#e7e3d6]' : ''
        }`}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <Icon
            name="chevron"
            size={12}
            className={`mt-[3px] shrink-0 text-[#a49d8c] transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-medium text-[#33302a]">{suite.name}</span>
              <span className="rounded-full bg-[#e2ded0] px-1.5 py-px text-[11px] font-semibold tabular-nums text-[#7c7666] group-hover:bg-[#d8d3c3]">
                {suite.tests.length}
              </span>
              {suite.failed > 0 && (
                <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-[#ab4132]">
                  <Icon name="alert" size={11} />
                  {suite.failed}
                </span>
              )}
            </span>
            <span className="mt-[7px] flex items-center gap-2">
              <HealthBar
                passed={suite.passed}
                skipped={suite.skipped}
                failed={suite.failed}
                className="flex-1"
              />
              <span className="text-[11px] tabular-nums text-[#a49d8c]">
                {shortAge(suite.lastRunMinutesAgo)}
              </span>
            </span>
          </span>
        </button>
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#8d8878] opacity-0 transition hover:bg-[#d6d1c1] hover:text-[#2b2922] focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t('add_test_to', { value1: suite.name })}
          title={t('add_test_to', { value1: suite.name })}
          onClick={() => (window.location.hash = '#/recorder')}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      {expanded && (
        <ul className="ml-[15px] mt-0.5 border-l border-[#dfdacb] pl-1.5">
          {visible.map((test) => (
            <li key={test.id}>
              <a
                href="#/recorder"
                className="flex items-center gap-2 rounded-md px-2 py-[6px] no-underline hover:bg-[#e4e0d2]"
              >
                <span
                  className={`h-[6px] w-[6px] shrink-0 rounded-full ${statusTone[test.status].dot}`}
                />
                <span className="truncate text-[13px] text-[#5f5b51]">{test.name}</span>
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[#aaa393]">
                  {shortAge(test.minutesAgo)}
                </span>
              </a>
            </li>
          ))}
          {hidden > 0 && (
            <li>
              <button
                type="button"
                className="w-full rounded-md px-2 py-[6px] text-left text-[12px] font-medium text-[#8a8474] hover:bg-[#e4e0d2] hover:text-[#2b2922]"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll ? t('show_less') : `Show ${hidden} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
};

const Sidebar = ({
  project,
  onSelectProject,
}: {
  project: ProjectRecord;
  onSelectProject: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col px-3 pb-3 pt-[30px]">
      <div className="relative">
        <div className="flex gap-1.5">
          <button
            type="button"
            className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 text-left transition hover:bg-[#e4e0d2]"
            aria-expanded={menuOpen}
            aria-label={t('current_project', { value1: project.name })}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold ${project.swatch}`}
            >
              {project.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-[#2b2922]">
                {project.name}
              </span>
              <span className="block truncate text-[11px] text-[#948e7e]">
                {project.suites.length} {t('suites')} {project.totals.tests} {t('tests_2')}
              </span>
            </span>
            <Icon
              name="caret"
              size={14}
              className={`shrink-0 text-[#a49d8c] transition-transform ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <button
            type="button"
            className="grid h-12 w-9 shrink-0 place-items-center rounded-xl text-[#7d7767] transition hover:bg-[#e4e0d2] hover:text-[#2b2922]"
            aria-label={t('new_project')}
            title={t('new_project')}
          >
            <Icon name="plus" size={17} />
          </button>
        </div>

        {menuOpen && (
          <div
            className="absolute inset-x-0 top-[52px] z-30 rounded-xl border border-[#e2ddcf] bg-white p-1 shadow-[0_14px_40px_rgba(56,48,34,.16)]"
            role="menu"
          >
            {projects.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                role="menuitem"
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-[#f3f0e7] ${
                  candidate.id === project.id ? 'bg-[#f3f0e7]' : ''
                }`}
                onClick={() => {
                  onSelectProject(candidate.id);
                  setMenuOpen(false);
                }}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${candidate.swatch}`}
                >
                  {candidate.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[#2b2922]">
                    {candidate.name}
                  </span>
                  <span className="block text-[11px] text-[#948e7e]">
                    {candidate.totals.tests} {t('tests_3')} {candidate.environment}
                  </span>
                </span>
                {candidate.id === project.id && (
                  <Icon name="check" size={13} className="text-[#3d7a5c]" />
                )}
              </button>
            ))}
            <div className="my-1 h-px bg-[#eeebe1]" />
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[13px] text-[#5f5b51] hover:bg-[#f3f0e7]"
            >
              <Icon name="plus" size={14} />
              {t('new_project')}
            </button>
          </div>
        )}
      </div>

      <nav className="mt-3 grid gap-0.5" aria-label={t('project')}>
        <a
          href="#/experiments/workspace"
          className="flex h-10 items-center gap-2.5 rounded-lg bg-[#e4e0d2] px-2.5 text-[14px] font-medium text-[#2b2922] no-underline"
        >
          <Icon name="overview" size={16} className="text-[#5f5b51]" />
          {t('overview')}
        </a>
        <a
          href="#/recorder"
          className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-[#5f5b51] no-underline transition hover:bg-[#e4e0d2] hover:text-[#2b2922]"
        >
          <Icon name="test" size={16} className="text-[#8a8474]" />
          {t('new_test')}
          <span className="ml-auto text-[11px] tabular-nums text-[#a49d8c]">{t('n')}</span>
        </a>
        <button
          type="button"
          className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] text-[#5f5b51] transition hover:bg-[#e4e0d2] hover:text-[#2b2922]"
        >
          <Icon name="suite" size={16} className="text-[#8a8474]" />
          {t('new_test_suite')}
        </button>
      </nav>

      <div className="mt-5 flex items-center justify-between pl-2.5 pr-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9c9585]">
          {t('test_suites')}
        </span>
        <button
          type="button"
          className="grid h-6 w-6 place-items-center rounded-md text-[#8d8878] transition hover:bg-[#e4e0d2] hover:text-[#2b2922]"
          aria-label={t('add_test_suite')}
          title={t('add_test_suite')}
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <ul className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2 pr-0.5">
        {project.suites.map((suite) => (
          <SuiteItem key={suite.id} suite={suite} />
        ))}
      </ul>

      <div className="mt-1 border-t border-[#e0dbcd] pt-2">
        <a
          href="#/experiments"
          className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[14px] text-[#5f5b51] no-underline transition hover:bg-[#e4e0d2] hover:text-[#2b2922]"
        >
          <Icon name="settings" size={16} className="text-[#8a8474]" />
          {t('settings')}
        </a>
        <button
          type="button"
          className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-[#e4e0d2]"
        >
          <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#cfe0d5] text-[11px] font-bold text-[#3a5449]">
            {t('ns')}
            <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-[#eceadf] bg-[#5f9d7d]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-[#2b2922]">
              {t('nikita_s')}
            </span>
            <span className="block truncate text-[11px] text-[#948e7e]">
              {t('local_workspace')}
            </span>
          </span>
          <Icon name="dots" size={15} className="shrink-0 text-[#a49d8c]" />
        </button>
      </div>
    </aside>
  );
};

/* ------------------------------------------------------------------ chart */

const RunsChart = ({ days }: { days: DayRecord[] }) => {
  const { t } = useTranslation();
  const max = Math.max(...days.map((day) => day.passed + day.failed + day.skipped));
  const scale = Math.max(20, Math.ceil(max / 20) * 20);
  const ticks = [4, 3, 2, 1, 0].map((step) => (scale / 4) * step);
  const labelEvery = days.length > 20 ? 3 : days.length > 10 ? 2 : 1;

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="relative h-[196px]">
        {ticks.map((tick) => (
          <div
            key={tick}
            className="absolute inset-x-0 flex items-center gap-2"
            style={{ top: `${(1 - tick / scale) * 100}%` }}
          >
            <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-[#b0a996]">
              {tick}
            </span>
            <span className="h-px flex-1 bg-[#efece2]" />
          </div>
        ))}
        <div className="absolute inset-y-0 left-9 right-0 flex items-end gap-[4px]">
          {days.map((day) => {
            const total = day.passed + day.failed + day.skipped;
            const segments = (
              [
                ['failed', day.failed],
                ['skipped', day.skipped],
                ['passed', day.passed],
              ] as const
            ).filter(([, value]) => value > 0);
            return (
              <div key={day.key} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className="flex flex-col overflow-hidden rounded-[3px] opacity-90 transition group-hover:opacity-100"
                  style={{ height: `${(total / scale) * 100}%` }}
                >
                  {segments.map(([status, value]) => (
                    <div
                      key={status}
                      className={statusTone[status].bar}
                      style={{ flexGrow: value, flexBasis: 0 }}
                    />
                  ))}
                </div>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-[#e2ddcf] bg-white px-2.5 py-2 shadow-[0_10px_28px_rgba(56,48,34,.16)] group-hover:block">
                  <p className="text-[12px] font-semibold text-[#2b2922]">
                    {day.weekday} {day.dayOfMonth}
                  </p>
                  <p className="mb-1 text-[11px] text-[#948e7e]">
                    {total} {t('runs_3')}
                  </p>
                  {(
                    [
                      ['passed', day.passed],
                      ['skipped', day.skipped],
                      ['failed', day.failed],
                    ] as const
                  ).map(([status, value]) => (
                    <p
                      key={status}
                      className="flex items-center gap-1.5 text-[11px] text-[#5f5b51]"
                    >
                      <span className={`h-[6px] w-[6px] rounded-full ${statusTone[status].dot}`} />
                      {statusTone[status].label}
                      <span className="ml-auto pl-3 font-semibold tabular-nums">{value}</span>
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-[4px] pl-9">
        {days.map((day, index) => (
          <span
            key={day.key}
            className="flex-1 text-center text-[10px] tabular-nums text-[#a9a290]"
          >
            {index % labelEvery === 0 ? day.dayOfMonth : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------- dashboard */

type SortKey = 'name' | 'tests' | 'passRate' | 'lastRun';

const suitePassRate = (suite: SuiteRecord) =>
  (suite.passed / Math.max(1, suite.passed + suite.failed)) * 100;

const activityStyle: Record<ActivityKind, { icon: IconName; chip: string; label: string }> = {
  added: { icon: 'plus', chip: 'bg-[#e8f1ea] text-[#3d7a5c]', label: 'Added' },
  updated: { icon: 'pencil', chip: 'bg-[#f7f0da] text-[#93701f]', label: 'Updated' },
  recorded: { icon: 'play', chip: 'bg-[#ece7f7] text-[#5d4d92]', label: 'Recorded' },
  fixed: { icon: 'check', chip: 'bg-[#e8f1ea] text-[#3d7a5c]', label: 'Fixed' },
};

export const Dashboard3 = () => {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState(projects[0].id);
  const [range, setRange] = useState(14);
  const [query, setQuery] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'lastRun',
    direction: 'asc',
  });

  const project = projects.find((candidate) => candidate.id === projectId) ?? projects[0];
  const { totals } = project;

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
  }, []);

  const days = useMemo(() => project.days.slice(-range), [project, range]);

  const suiteRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = project.suites.filter((suite) => {
      if (onlyAttention && suite.failed === 0) return false;
      if (!needle) return true;
      return (
        suite.name.toLowerCase().includes(needle) ||
        suite.owner.toLowerCase().includes(needle) ||
        suite.tests.some((test) => test.name.toLowerCase().includes(needle))
      );
    });
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.name.localeCompare(b.name) * factor;
        case 'tests':
          return (a.tests.length - b.tests.length) * factor;
        case 'passRate':
          return (suitePassRate(a) - suitePassRate(b)) * factor;
        default:
          return (a.lastRunMinutesAgo - b.lastRunMinutesAgo) * factor;
      }
    });
  }, [project, query, onlyAttention, sort]);

  const suiteTally = project.suites.reduce(
    (tally, suite) => ({
      passed: tally.passed + suite.passed,
      skipped: tally.skipped + suite.skipped,
      failed: tally.failed + suite.failed,
    }),
    { passed: 0, skipped: 0, failed: 0 },
  );

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'name' ? 'asc' : 'desc' },
    );

  const SortHeader = ({
    label,
    sortKey,
    className = '',
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) => (
    <button
      type="button"
      className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.09em] transition hover:text-[#4b473e] ${
        sort.key === sortKey ? 'text-[#4b473e]' : 'text-[#a09a88]'
      } ${className}`}
      onClick={() => toggleSort(sortKey)}
    >
      {label}
      <Icon
        name="caret"
        size={11}
        className={`transition-transform ${sort.key === sortKey ? '' : 'opacity-0'} ${
          sort.key === sortKey && sort.direction === 'asc' ? 'rotate-180' : ''
        }`}
      />
    </button>
  );

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-[#eceadf] pt-2 font-sans text-[#2b2922] antialiased">
      {/* Traffic-light strip: only over the sidebar, so the content header stays clickable. */}
      <div className="fixed left-0 top-0 z-40 h-[38px] w-[300px] [-webkit-app-region:drag]" />

      <Sidebar project={project} onSelectProject={setProjectId} />

      <div className="mb-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-[#e0dbcd] bg-[#faf9f5] shadow-[0_1px_2px_rgba(56,48,34,.05),0_12px_32px_rgba(56,48,34,.07)]">
        <header className="flex h-[58px] shrink-0 items-center justify-between gap-4 border-b border-[#eeebe1] px-6 [-webkit-app-region:drag]">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-[#948e7e] [-webkit-app-region:no-drag]">
            <span className="truncate">{project.name}</span>
            <Icon name="chevron" size={12} className="shrink-0 text-[#c0b9a6]" />
            <span className="truncate font-medium text-[#2b2922]">{t('overview')}</span>
            <span className="ml-1 hidden shrink-0 rounded-full bg-[#f0ede3] px-2 py-[3px] text-[11px] font-medium text-[#7d7767] sm:inline">
              {project.environment}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 [-webkit-app-region:no-drag]">
            <label className="flex h-9 w-[230px] items-center gap-2 rounded-lg border border-[#e6e1d4] bg-white px-2.5 text-[#948e7e] focus-within:border-[#cfc7b2]">
              <Icon name="search" size={15} />
              <input
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[#2b2922] outline-none placeholder:text-[#b0a996]"
                aria-label={t('search_tests_2')}
                placeholder={t('search_tests')}
              />
              <kbd className="rounded border border-[#e6e1d4] px-1 text-[10px] font-medium text-[#a9a290]">
                {t('k')}
              </kbd>
            </label>
            <button
              type="button"
              className="relative grid h-9 w-9 place-items-center rounded-lg text-[#7d7767] transition hover:bg-[#f0ede3] hover:text-[#2b2922]"
              aria-label={t('notifications')}
            >
              <Icon name="bell" size={17} />
              <span className="absolute right-[7px] top-[7px] h-[6px] w-[6px] rounded-full bg-[#c85c4c] ring-2 ring-[#faf9f5]" />
            </button>
            <a
              href="#/recorder"
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#2b2922] px-3.5 text-[13px] font-semibold text-[#faf9f5] no-underline transition hover:bg-[#3d3a31]"
            >
              <Icon name="plus" size={15} />
              {t('new_test')}
            </a>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="w-full p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#26241e]">
                  {t('project_overview')}
                </h1>
                <p className="mt-1 text-[13px] text-[#8b8574]">
                  {project.suites.length} {t('suites')} {totals.tests} {t('tests_last_run')}{' '}
                  {longAge(Math.min(...project.suites.map((suite) => suite.lastRunMinutesAgo)))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-[#e6e1d4] bg-white p-0.5">
                  {[7, 14, 30].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`h-8 rounded-md px-3 text-[12px] font-medium transition ${
                        range === option
                          ? 'bg-[#2b2922] text-[#faf9f5]'
                          : 'text-[#7d7767] hover:text-[#2b2922]'
                      }`}
                      onClick={() => setRange(option)}
                    >
                      {option}
                      {t('d')}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-[#e6e1d4] bg-white px-3.5 text-[13px] font-medium text-[#4b473e] transition hover:bg-[#f3f0e7]"
                >
                  <Icon name="play" size={14} />
                  {t('run_all')}
                </button>
              </div>
            </div>

            {/* stats */}
            <section className="mt-5 grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2">
              <Panel className="p-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#8b8574]">
                  <Icon name="test" size={14} className="text-[#a49d8c]" />
                  {t('total_tests')}
                </div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <strong className="text-[30px] font-semibold tracking-[-0.03em] tabular-nums">
                    {totals.tests}
                  </strong>
                  <Trend value={totals.testsAdded} unit="" digits={0} />
                </div>
                <p className="mt-2 text-[12px] text-[#948e7e]">
                  {t('in_2')} {project.suites.length} {t('suites')} {totals.testsAdded}{' '}
                  {t('added_this_month')}
                </p>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#8b8574]">
                  <Icon name="check" size={14} className="text-[#a49d8c]" />
                  {t('pass_rate')}
                </div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <strong className="text-[30px] font-semibold tracking-[-0.03em] tabular-nums">
                    {totals.passRate.toFixed(1)}%
                  </strong>
                  <Trend value={totals.passRateDelta} unit="pts" />
                </div>
                <HealthBar
                  passed={suiteTally.passed}
                  skipped={suiteTally.skipped}
                  failed={suiteTally.failed}
                  className="mt-3"
                />
                <p className="mt-2 text-[12px] text-[#948e7e]">
                  {suiteTally.passed} {t('passed_2')} {suiteTally.skipped} {t('skipped_2')}{' '}
                  {suiteTally.failed} {t('failed')}
                </p>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#8b8574]">
                  <Icon name="play" size={14} className="text-[#a49d8c]" />
                  {t('test_runs_30d')}
                </div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <strong className="text-[30px] font-semibold tracking-[-0.03em] tabular-nums">
                    {totals.runs.toLocaleString()}
                  </strong>
                  <Trend value={totals.runsDelta} unit="%" />
                </div>
                <p className="mt-2 text-[12px] text-[#948e7e]">
                  {t('avg')} {duration(totals.seconds)} {t('per_test')}{' '}
                  {signed(totals.secondsDelta, 0)}% duration
                </p>
              </Panel>

              <Panel className="p-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#8b8574]">
                  <Icon name="alert" size={14} className="text-[#a49d8c]" />
                  {t('needs_attention')}
                </div>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <strong className="text-[30px] font-semibold tracking-[-0.03em] tabular-nums">
                    {totals.failing}
                  </strong>
                  <span className="rounded-full bg-[#f7f0da] px-1.5 py-[3px] text-[11px] font-semibold text-[#93701f]">
                    {totals.flaky} {t('flaky')}
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-[#948e7e]">
                  {t('failing_in')} {project.suites.filter((suite) => suite.failed > 0).length}{' '}
                  {t('suites_2')}
                </p>
              </Panel>
            </section>

            {/* chart + activity */}
            <section className="mt-3 grid grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] gap-3 max-[1100px]:grid-cols-1">
              <Panel>
                <PanelHeader
                  title={t('test_runs')}
                  subtitle={t('daily_results_across_the_last_days', { value1: range })}
                  action={
                    <div className="flex items-center gap-3">
                      {(['passed', 'skipped', 'failed'] as const).map((status) => (
                        <span
                          key={status}
                          className="flex items-center gap-1.5 text-[11px] text-[#7d7767]"
                        >
                          <span
                            className={`h-[7px] w-[7px] rounded-full ${statusTone[status].dot}`}
                          />
                          {statusTone[status].label}
                        </span>
                      ))}
                    </div>
                  }
                />
                <RunsChart days={days} />
              </Panel>

              <Panel className="flex flex-col">
                <PanelHeader
                  title={t('recent_activity')}
                  subtitle={t('changes_this_week', { value1: totals.changesThisWeek })}
                  action={
                    <button
                      type="button"
                      className="text-[12px] font-medium text-[#8b8574] transition hover:text-[#2b2922]"
                    >
                      {t('view_all')}
                    </button>
                  }
                />
                <ul className="min-h-0 flex-1 divide-y divide-[#f2efe6] overflow-y-auto">
                  {project.activity.map((item) => {
                    const style = activityStyle[item.kind];
                    return (
                      <li key={item.id} className="flex gap-2.5 px-4 py-3 hover:bg-[#faf9f4]">
                        <span
                          className={`mt-px grid h-6 w-6 shrink-0 place-items-center rounded-lg ${style.chip}`}
                        >
                          <Icon name={style.icon} size={12} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-[#33302a]">
                            {item.test}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#948e7e]">
                            {style.label} {t('in_2')} {item.suite} · {item.author}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-[#a9a290]">
                          {shortAge(item.minutesAgo)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </section>

            {/* suites table */}
            <Panel className="mt-3">
              <PanelHeader
                title={t('test_suites')}
                subtitle={t('of_suites', {
                  value1: suiteRows.length,
                  value2: project.suites.length,
                })}
                action={
                  <div className="flex items-center gap-2">
                    <label className="flex h-8 w-[190px] items-center gap-2 rounded-lg border border-[#e6e1d4] bg-[#faf9f5] px-2.5 text-[#948e7e] focus-within:border-[#cfc7b2]">
                      <Icon name="filter" size={13} />
                      <input
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-[#2b2922] outline-none placeholder:text-[#b0a996]"
                        aria-label={t('filter_test_suites')}
                        placeholder={t('filter_suites')}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      {query && (
                        <button
                          type="button"
                          aria-label={t('clear_filter')}
                          className="text-[#a9a290] hover:text-[#2b2922]"
                          onClick={() => setQuery('')}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      )}
                    </label>
                    <button
                      type="button"
                      className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition ${
                        onlyAttention
                          ? 'border-[#f0d6d0] bg-[#fae9e5] text-[#ab4132]'
                          : 'border-[#e6e1d4] bg-[#faf9f5] text-[#7d7767] hover:text-[#2b2922]'
                      }`}
                      aria-pressed={onlyAttention}
                      onClick={() => setOnlyAttention((current) => !current)}
                    >
                      <Icon name="alert" size={13} />
                      {t('needs_attention')}
                    </button>
                  </div>
                }
              />

              <div className="grid grid-cols-[minmax(0,2.1fr)_70px_minmax(140px,1fr)_110px_minmax(0,1fr)_28px] items-center gap-3 border-b border-[#f2efe6] px-4 py-2">
                <SortHeader label={t('suite')} sortKey="name" />
                <SortHeader label={t('tests')} sortKey="tests" />
                <SortHeader label={t('pass_rate')} sortKey="passRate" />
                <SortHeader label={t('last_run')} sortKey="lastRun" />
                <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#a09a88]">
                  {t('owner')}
                </span>
                <span />
              </div>

              {suiteRows.map((suite) => {
                const rate = suitePassRate(suite);
                return (
                  <button
                    key={suite.id}
                    type="button"
                    className="grid w-full grid-cols-[minmax(0,2.1fr)_70px_minmax(140px,1fr)_110px_minmax(0,1fr)_28px] items-center gap-3 border-b border-[#f2efe6] px-4 py-2.5 text-left transition last:border-b-0 hover:bg-[#f7f5ee]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                          suite.failed > 0
                            ? statusTone.failed.dot
                            : suite.skipped > 0
                              ? statusTone.skipped.dot
                              : statusTone.passed.dot
                        }`}
                      />
                      <span className="truncate text-[14px] font-medium text-[#33302a]">
                        {suite.name}
                      </span>
                      {suite.failed > 0 && (
                        <span className="shrink-0 rounded-full bg-[#fae9e5] px-1.5 py-px text-[11px] font-semibold text-[#ab4132]">
                          {suite.failed} {t('failing')}
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] tabular-nums text-[#5f5b51]">
                      {suite.tests.length}
                    </span>
                    <span className="flex items-center gap-2">
                      <HealthBar
                        passed={suite.passed}
                        skipped={suite.skipped}
                        failed={suite.failed}
                        className="w-full max-w-[110px] flex-1"
                      />
                      <span className="shrink-0 text-[12px] font-medium tabular-nums text-[#5f5b51]">
                        {rate.toFixed(0)}%
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px] text-[#8b8574]">
                      <Icon name="clock" size={12} className="text-[#b0a996]" />
                      {shortAge(suite.lastRunMinutesAgo)} {t('ago')}
                    </span>
                    <span className="truncate text-[12px] text-[#8b8574]">{suite.owner}</span>
                    <Icon name="chevron" size={14} className="justify-self-end text-[#c0b9a6]" />
                  </button>
                );
              })}

              {suiteRows.length === 0 && (
                <p className="px-4 py-8 text-center text-[13px] text-[#948e7e]">
                  {t('no_suites_match')}
                  {query}”.
                </p>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
};
