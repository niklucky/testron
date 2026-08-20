import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
type GradientPreset = 'teal' | 'prism' | 'midnight';

const gradientPresets: { value: GradientPreset; label: string }[] = [
  { value: 'teal', label: 'Teal' },
  { value: 'prism', label: 'Prism' },
  { value: 'midnight', label: 'Midnight' },
];

const Icon = ({ name, size = 18 }: { name: string; size?: number }) => {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    tests: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
    runs: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m10 8 6 4-6 4Z" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M6 7v10M8 7c5 0 4-1 8-1" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    sidebar: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M9 4v16" />
      </>
    ),
    folder: (
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    dots: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg
      className="ui-icon"
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
      {paths[name]}
    </svg>
  );
};

const projects = [
  { name: 'Commerce app', initials: 'CA', count: 24, color: 'violet' },
  { name: 'Marketing site', initials: 'MS', count: 12, color: 'cyan' },
  { name: 'Mobile web', initials: 'MW', count: 8, color: 'blue' },
];

const testSuites = [
  {
    name: 'Checkout',
    tests: [
      'Guest checkout',
      'Saved card payment',
      'Promo code',
      'Tax calculation',
      'Order confirmation',
    ],
  },
  {
    name: 'Authentication',
    tests: ['Sign in', 'Create account', 'Reset password', 'Session expiry', 'Two-factor auth'],
  },
  {
    name: 'Account',
    tests: ['Update profile', 'Change password', 'Notification preferences', 'Delete account'],
  },
];

const testRuns = [
  {
    name: 'Checkout flow',
    environment: 'Production',
    time: '2 min ago',
    duration: '1m 42s',
    status: 'Passed',
  },
  {
    name: 'User onboarding',
    environment: 'Staging',
    time: '18 min ago',
    duration: '2m 08s',
    status: 'Passed',
  },
  {
    name: 'Payment validation',
    environment: 'Production',
    time: '41 min ago',
    duration: '58s',
    status: 'Failed',
  },
  {
    name: 'Account settings',
    environment: 'Preview',
    time: '1 hr ago',
    duration: '1m 17s',
    status: 'Running',
  },
];

const changes = [
  {
    initials: 'AK',
    color: 'lilac',
    title: 'Updated assertion in Checkout flow',
    meta: 'Anna Kim · 12 minutes ago',
    tag: 'Edited',
  },
  {
    initials: 'MO',
    color: 'sky',
    title: 'Added visual check to User onboarding',
    meta: 'Mateo Ortiz · 36 minutes ago',
    tag: 'Added',
  },
  {
    initials: 'JS',
    color: 'peach',
    title: 'Changed test data in Payment validation',
    meta: 'Jamie Song · 2 hours ago',
    tag: 'Edited',
  },
];

const AreaChart = () => {
  const { t } = useTranslation();
  return (
    <div className="chart-wrap" aria-label={t('test_runs_over_the_last_seven_days')}>
      <svg viewBox="0 0 720 238" role="img">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--blue)" stopOpacity=".4" />
            <stop offset="1" stopColor="var(--blue)" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[38, 88, 138, 188].map((y) => (
          <line key={y} x1="28" x2="704" y1={y} y2={y} className="chart-grid" />
        ))}
        <path
          d="M28 174 C80 170 91 112 141 121 S208 164 258 128 S328 61 374 89 S445 151 492 112 S565 54 611 72 S670 105 704 48 L704 214 L28 214Z"
          fill="url(#areaFill)"
        />
        <path
          d="M28 174 C80 170 91 112 141 121 S208 164 258 128 S328 61 374 89 S445 151 492 112 S565 54 611 72 S670 105 704 48"
          className="chart-line"
        />
        {[
          ['28', '174'],
          ['141', '121'],
          ['258', '128'],
          ['374', '89'],
          ['492', '112'],
          ['611', '72'],
          ['704', '48'],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="4" className="chart-point" />
        ))}
      </svg>
      <div className="chart-labels">
        <span>{t('mon')}</span>
        <span>{t('tue')}</span>
        <span>{t('wed')}</span>
        <span>{t('thu')}</span>
        <span>{t('fri')}</span>
        <span>{t('sat')}</span>
        <span>{t('sun')}</span>
      </div>
    </div>
  );
};

const DonutChart = () => {
  const { t } = useTranslation();
  return (
    <div className="donut-layout">
      <div className="donut" aria-label={t('92_percent_passing_tests')}>
        <div>
          <strong>92%</strong>
          <span>{t('passing')}</span>
        </div>
      </div>
      <div className="donut-legend">
        <div>
          <i className="legend-dot passed" />
          <span>{t('passed')}</span>
          <strong>156</strong>
        </div>
        <div>
          <i className="legend-dot failed" />
          <span>{t('failed_2')}</span>
          <strong>9</strong>
        </div>
        <div>
          <i className="legend-dot skipped" />
          <span>{t('skipped')}</span>
          <strong>4</strong>
        </div>
      </div>
    </div>
  );
};

export const Dashboard = () => {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem('testron-theme') === 'dark' ? 'dark' : 'light',
  );
  const [gradient, setGradient] = useState<GradientPreset>(() => {
    const stored = localStorage.getItem('testron-gradient');
    return stored === 'prism' || stored === 'midnight' ? stored : 'teal';
  });
  const [activeProject, setActiveProject] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('testron-sidebar-collapsed') === 'true',
  );
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [expandedSuites, setExpandedSuites] = useState<string[]>(['Checkout']);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.gradient = gradient;
    localStorage.setItem('testron-theme', theme);
    localStorage.setItem('testron-gradient', gradient);
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
  }, [gradient, theme]);

  useEffect(() => {
    localStorage.setItem('testron-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const toggleSidebar = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebarCollapsed((current) => !current);
      }
    };
    window.addEventListener('keydown', toggleSidebar);
    return () => window.removeEventListener('keydown', toggleSidebar);
  }, []);

  const selectedProject = projects[activeProject];

  return (
    <main
      className={`dashboard-shell relative grid h-screen min-h-[640px] w-screen overflow-hidden font-sans${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
    >
      <button
        className="sidebar-toggle fixed z-30 grid place-items-center"
        aria-label={sidebarCollapsed ? t('expand_sidebar') : t('collapse_sidebar')}
        aria-expanded={!sidebarCollapsed}
        title={t('sidebar_b', {
          value1: sidebarCollapsed ? t('expand') : t('collapse'),
        })}
        onClick={() => setSidebarCollapsed((current) => !current)}
      >
        <Icon name="sidebar" size={17} />
      </button>
      <aside className="glass sidebar flex min-h-0 flex-col">
        <div className="project-control">
          <button
            className="project-selector"
            aria-label={t('current_project', { value1: selectedProject.name })}
            aria-expanded={!sidebarCollapsed && projectMenuOpen}
            onClick={() => {
              if (sidebarCollapsed) setSidebarCollapsed(false);
              else setProjectMenuOpen((current) => !current);
            }}
          >
            <span className={`project-avatar ${selectedProject.color}`}>
              {selectedProject.initials}
            </span>
            <span className="project-selector-copy">
              <strong>{selectedProject.name}</strong>
            </span>
            <span className={`project-chevron${projectMenuOpen ? ' open' : ''}`}>
              <Icon name="chevron" size={15} />
            </span>
          </button>
          <button className="project-add" aria-label={t('add_project')} title={t('add_project')}>
            <Icon name="plus" size={17} />
          </button>
          {projectMenuOpen && !sidebarCollapsed && (
            <div className="project-menu" role="menu">
              {projects.map((project, index) => (
                <button
                  key={project.name}
                  className={activeProject === index ? 'active' : ''}
                  role="menuitem"
                  onClick={() => {
                    setActiveProject(index);
                    setProjectMenuOpen(false);
                  }}
                >
                  <span className={`project-avatar ${project.color}`}>{project.initials}</span>
                  <span>{project.name}</span>
                  {activeProject === index && <span className="project-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="main-nav grid gap-1" aria-label={t('project_navigation')}>
          <a className="active" href="#/experiments">
            <Icon name="grid" />
            {t('overview')}
          </a>
        </nav>

        <button
          className="collapsed-suites-button"
          aria-label={t('test_suites')}
          title={t('test_suites')}
          onClick={() => setSidebarCollapsed(false)}
        >
          <Icon name="folder" />
        </button>
        <section className="suites" aria-label={t('test_suites')}>
          <div className="suite-section-title">
            <span>{t('test_suites')}</span>
            <button aria-label={t('add_test_suite')} title={t('add_test_suite')}>
              <Icon name="plus" size={15} />
            </button>
          </div>
          <div className="suite-list">
            {testSuites.map((suite) => {
              const expanded = expandedSuites.includes(suite.name);
              return (
                <div className="suite" key={suite.name}>
                  <button
                    className="suite-toggle"
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedSuites((current) =>
                        expanded
                          ? current.filter((name) => name !== suite.name)
                          : [...current, suite.name],
                      )
                    }
                  >
                    <span className={`suite-chevron${expanded ? ' open' : ''}`}>
                      <Icon name="chevron" size={14} />
                    </span>
                    <Icon name="folder" size={16} />
                    <span>{suite.name}</span>
                  </button>
                  {expanded && (
                    <div className="suite-tests">
                      {suite.tests.slice(0, 5).map((test) => (
                        <a href="#/recorder" key={test}>
                          <Icon name="file" size={14} />
                          <span>{test}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <div className="sidebar-spacer flex-1" />
        <a className="settings-link" href="#/recorder">
          <Icon name="settings" />
          {t('settings')}
        </a>
        <button className="profile-card">
          <span className="avatar">
            {t('ns')}
            <span className="presence" />
          </span>
          <span className="profile-copy">
            <strong>{t('nikita_s')}</strong>
          </span>
          <Icon name="dots" size={17} />
        </button>
      </aside>

      <section className="dashboard-main h-full min-w-0 overflow-auto">
        <header className="topbar flex items-center justify-between gap-8">
          <div>
            <p className="eyebrow">{selectedProject.name.toUpperCase()}</p>
            <h1>{t('project_overview')}</h1>
            <p>{t('monitor_test_health_runs_and_recent_changes_for_this_project')}</p>
          </div>
          <div className="top-actions flex items-center gap-2">
            <label className="search-box">
              <Icon name="search" size={17} />
              <input aria-label={t('search')} placeholder={t('search_tests')} />
              <kbd>{t('k_2')}</kbd>
            </label>
            <div className="color-switcher" role="group" aria-label={t('background_gradient')}>
              {gradientPresets.map((preset) => (
                <button
                  key={preset.value}
                  className={`gradient-swatch ${preset.value}${gradient === preset.value ? ' active' : ''}`}
                  aria-label={t('use_gradient', { value1: preset.label })}
                  aria-pressed={gradient === preset.value}
                  title={t('gradient', { value1: preset.label })}
                  onClick={() => setGradient(preset.value)}
                />
              ))}
            </div>
            <button
              className="icon-button"
              aria-label={t('toggle_color_theme')}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              <Icon name={theme === 'light' ? 'moon' : 'sun'} />
            </button>
            <button className="icon-button notification" aria-label={t('notifications')}>
              <Icon name="bell" />
              <i />
            </button>
            <a className="primary-button" href="#/recorder">
              <Icon name="plus" size={17} />
              {t('new_test')}
            </a>
          </div>
        </header>

        <section className="metric-grid grid grid-cols-4 gap-[13px]" aria-label={t('key_metrics')}>
          <article className="glass metric-card">
            <div className="metric-heading">
              <span>{t('total_tests')}</span>
              <i className="metric-icon blue">
                <Icon name="tests" />
              </i>
            </div>
            <div className="metric-value">184</div>
            <div className="metric-foot positive">
              <strong>↗ 12.4%</strong>
              <span>{t('vs_last_month')}</span>
            </div>
          </article>
          <article className="glass metric-card">
            <div className="metric-heading">
              <span>{t('pass_rate')}</span>
              <i className="metric-icon green">✓</i>
            </div>
            <div className="metric-value">92.3%</div>
            <div className="metric-foot positive">
              <strong>↗ 2.1%</strong>
              <span>{t('vs_last_month')}</span>
            </div>
          </article>
          <article className="glass metric-card">
            <div className="metric-heading">
              <span>{t('avg_duration')}</span>
              <i className="metric-icon violet">◷</i>
            </div>
            <div className="metric-value">{t('1m_38s')}</div>
            <div className="metric-foot positive">
              <strong>↓ 8.2%</strong>
              <span>{t('faster_this_month')}</span>
            </div>
          </article>
          <article className="glass metric-card">
            <div className="metric-heading">
              <span>{t('needs_attention')}</span>
              <i className="metric-icon coral">!</i>
            </div>
            <div className="metric-value">9</div>
            <div className="metric-foot negative">
              <strong>{t('3_new')}</strong>
              <span>{t('since_yesterday')}</span>
            </div>
          </article>
        </section>

        <section className="chart-grid-layout">
          <article className="glass panel area-panel">
            <div className="panel-header">
              <div>
                <h2>{t('test_activity')}</h2>
                <p>{t('runs_across_all_environments')}</p>
              </div>
              <button className="select-button">
                {t('last_7_days')} <span>⌄</span>
              </button>
            </div>
            <div className="chart-summary">
              <strong>1,248</strong>
              <span className="trend-pill">↗ 18.2%</span>
            </div>
            <AreaChart />
          </article>
          <article className="glass panel health-panel">
            <div className="panel-header">
              <div>
                <h2>{t('test_health')}</h2>
                <p>{t('current_suite_status')}</p>
              </div>
              <button className="icon-button mini" aria-label={t('more_options')}>
                <Icon name="dots" />
              </button>
            </div>
            <DonutChart />
            <a className="panel-link" href="#/recorder">
              {t('view_all_tests')} <Icon name="arrow" size={15} />
            </a>
          </article>
        </section>

        <section className="tables-grid">
          <article className="glass panel table-panel">
            <div className="panel-header">
              <div>
                <h2>{t('recent_test_runs')}</h2>
                <p>{t('latest_activity_across_your_projects')}</p>
              </div>
              <a href="#/recorder" className="text-button">
                {t('view_all')}
              </a>
            </div>
            <div className="data-table" role="table">
              <div className="table-row table-head" role="row">
                <span>{t('test_2')}</span>
                <span>{t('environment_2')}</span>
                <span>{t('duration_2')}</span>
                <span>{t('status')}</span>
                <span />
              </div>
              {testRuns.map((run) => (
                <div className="table-row" role="row" key={run.name}>
                  <span className="test-name">
                    <i className={`run-icon ${run.status.toLowerCase()}`}>
                      {run.status === 'Passed' ? '✓' : run.status === 'Failed' ? '×' : '◷'}
                    </i>
                    <span>
                      <strong>{run.name}</strong>
                      <small>{run.time}</small>
                    </span>
                  </span>
                  <span>
                    <i className="env-dot" />
                    {run.environment}
                  </span>
                  <span>{run.duration}</span>
                  <span>
                    <i className={`status-pill ${run.status.toLowerCase()}`}>{run.status}</i>
                  </span>
                  <button aria-label={t('open_4', { value1: run.name })}>
                    <Icon name="chevron" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </article>
          <article className="glass panel changes-panel">
            <div className="panel-header">
              <div>
                <h2>{t('recent_changes')}</h2>
                <p>{t('updates_to_your_test_suite')}</p>
              </div>
              <a href="#/recorder" className="text-button">
                {t('view_all')}
              </a>
            </div>
            <div className="change-list">
              {changes.map((change) => (
                <div className="change-item" key={change.title}>
                  <span className={`change-avatar ${change.color}`}>{change.initials}</span>
                  <span className="change-copy">
                    <strong>{change.title}</strong>
                    <small>{change.meta}</small>
                  </span>
                  <i className={`change-tag ${change.tag.toLowerCase()}`}>{change.tag}</i>
                </div>
              ))}
            </div>
            <div className="activity-note">
              <span className="activity-icon">↗</span>
              <span>
                <strong>{t('27_changes_this_week')}</strong>
                <small>{t('that_s_14_more_than_last_week')}</small>
              </span>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
};
