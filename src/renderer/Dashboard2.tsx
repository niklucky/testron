import { useEffect, useState, type ReactNode } from 'react';

type IconName =
  'grid' | 'settings' | 'search' | 'plus' | 'chevron' | 'sparkle' | 'folder' | 'file' | 'dots';

const Icon = ({ name, size = 18 }: { name: IconName; size?: number }) => {
  const paths: Record<IconName, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.4 6A8 8 0 0 0 9 7L6.5 6l-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4L9 17a8 8 0 0 0 1.4 1l.3 2.6h4L15 18a8 8 0 0 0 1.5-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    sparkle: (
      <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Zm6 12 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />
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
    dots: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  };

  return (
    <svg
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
  { name: 'Commerce app', initials: 'CA', color: 'bg-[#b9b4ef]' },
  { name: 'Marketing site', initials: 'MS', color: 'bg-[#a9dce0]' },
  { name: 'Mobile web', initials: 'MW', color: 'bg-[#aec9ed]' },
];

const testSuites = [
  {
    name: 'Checkout',
    tests: ['Guest checkout', 'Saved card payment', 'Promo code', 'Tax calculation'],
  },
  {
    name: 'Authentication',
    tests: ['Sign in', 'Create account', 'Reset password', 'Session expiry'],
  },
  {
    name: 'Account',
    tests: ['Update profile', 'Change password', 'Notification preferences'],
  },
];

const recentRuns = [
  { name: 'Checkout flow', environment: 'Production', time: '2 min ago', status: 'Passed' },
  { name: 'User onboarding', environment: 'Staging', time: '18 min ago', status: 'Passed' },
  { name: 'Payment validation', environment: 'Production', time: '41 min ago', status: 'Failed' },
  { name: 'Account settings', environment: 'Preview', time: '1 hr ago', status: 'Running' },
];

const runColors = {
  Passed: {
    icon: 'bg-[#e4f2eb] text-[#2d7358]',
    status: 'text-[#2d7358]',
  },
  Failed: {
    icon: 'bg-[#f7e7e4] text-[#a64f45]',
    status: 'text-[#a64f45]',
  },
  Running: {
    icon: 'bg-[#f6efd9] text-[#876b29]',
    status: 'text-[#876b29]',
  },
} as const;

export const Dashboard2 = () => {
  const [activeProject, setActiveProject] = useState(0);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [expandedSuites, setExpandedSuites] = useState<string[]>(['Checkout']);
  const selectedProject = projects[activeProject];

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
  }, []);

  return (
    <main className="relative grid h-screen min-h-[640px] w-screen grid-cols-[272px_minmax(0,1fr)] overflow-hidden bg-[radial-gradient(circle_at_2%_95%,rgb(75_206_173_/_26%),transparent_31%),radial-gradient(circle_at_22%_2%,rgb(172_135_247_/_25%),transparent_30%),radial-gradient(circle_at_74%_-12%,rgb(247_168_114_/_23%),transparent_37%),linear-gradient(135deg,#d8ebe5_0%,#eae2f2_48%,#f3e8dc_100%)] font-sans text-[#292a25] max-[800px]:grid-cols-[78px_minmax(0,1fr)]">
      <div className="fixed inset-x-0 top-0 z-30 h-[38px] [-webkit-app-region:drag]" />

      <aside className="flex min-h-0 flex-col px-[14px] pb-[14px] pt-[46px] max-[800px]:px-2">
        <div className="relative mb-2 grid grid-cols-[minmax(0,1fr)_36px] gap-1.5 max-[800px]:grid-cols-1">
          <button
            className="grid h-10! w-full grid-cols-[34px_minmax(0,1fr)_16px] items-center gap-2 rounded-full! bg-white/25! p-0! pr-2! text-left text-[#292a25]! transition hover:bg-white/45! max-[800px]:mx-auto max-[800px]:h-11! max-[800px]:w-11 max-[800px]:grid-cols-1 max-[800px]:place-items-center max-[800px]:pr-0!"
            aria-label={`Current project: ${selectedProject.name}`}
            aria-expanded={projectMenuOpen}
            onClick={() => setProjectMenuOpen((current) => !current)}
          >
            <span
              className={`grid h-[34px] w-[34px] place-items-center rounded-full text-[11px] font-bold text-[#24334c] ${selectedProject.color}`}
            >
              {selectedProject.initials}
            </span>
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-semibold max-[800px]:hidden">
              {selectedProject.name}
            </strong>
            <span
              className={`text-[#817f76] transition max-[800px]:hidden ${projectMenuOpen ? '-rotate-90' : 'rotate-90'}`}
            >
              <Icon name="chevron" size={14} />
            </span>
          </button>
          <button
            className="grid h-9! w-9 place-items-center self-center rounded-full! bg-white/25! p-0! text-[#65645d]! hover:bg-white/45! max-[800px]:mx-auto"
            aria-label="Add project"
          >
            <Icon name="plus" size={16} />
          </button>

          {projectMenuOpen && (
            <div className="absolute left-0 top-12 z-40 grid w-full gap-1 rounded-2xl bg-white/90 p-1.5 shadow-[0_16px_38px_rgb(58_50_44_/_16%)] backdrop-blur-xl max-[800px]:hidden">
              {projects.map((project, index) => (
                <button
                  key={project.name}
                  className={`grid min-h-11! w-full grid-cols-[30px_1fr_auto] items-center gap-2 rounded-xl! bg-transparent! px-2! py-1! text-left text-[13px] text-[#34352f]! hover:bg-[#efede7]! ${activeProject === index ? 'bg-[#efede7]!' : ''}`}
                  onClick={() => {
                    setActiveProject(index);
                    setProjectMenuOpen(false);
                  }}
                >
                  <span
                    className={`grid h-[30px] w-[30px] place-items-center rounded-full text-[10px] font-bold text-[#24334c] ${project.color}`}
                  >
                    {project.initials}
                  </span>
                  <span>{project.name}</span>
                  {activeProject === index && <span className="text-[#456f62]">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="grid gap-1" aria-label="Project navigation">
          <a
            className="flex h-[42px] items-center gap-3 rounded-full bg-white/40 px-3 text-[14px] font-semibold text-[#34352f] no-underline max-[800px]:mx-auto max-[800px]:h-11 max-[800px]:w-11 max-[800px]:justify-center max-[800px]:px-0"
            href="#/dashboard2"
          >
            <Icon name="grid" />
            <span className="max-[800px]:hidden">Overview</span>
          </a>
        </nav>

        <section
          className="min-h-0 overflow-y-auto max-[800px]:overflow-visible"
          aria-label="Test suites"
        >
          <div className="mb-2 mt-5 flex items-center justify-between px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#817f76] max-[800px]:justify-center max-[800px]:px-0">
            <span className="max-[800px]:hidden">Test suites</span>
            <button
              className="grid h-6! w-6 place-items-center bg-transparent! p-0! text-[#77756d]!"
              aria-label="Add test suite"
            >
              <Icon name="plus" size={14} />
            </button>
          </div>

          <div className="grid gap-0.5">
            {testSuites.map((suite) => {
              const expanded = expandedSuites.includes(suite.name);
              return (
                <div key={suite.name}>
                  <button
                    className="grid h-[38px]! w-full grid-cols-[15px_18px_minmax(0,1fr)] items-center gap-1.5 rounded-full! bg-transparent! px-2! text-left text-[14px] font-semibold text-[#62625b]! hover:bg-white/30! max-[800px]:mx-auto max-[800px]:h-11! max-[800px]:w-11 max-[800px]:grid-cols-1 max-[800px]:place-items-center max-[800px]:px-0!"
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedSuites((current) =>
                        expanded
                          ? current.filter((name) => name !== suite.name)
                          : [...current, suite.name],
                      )
                    }
                  >
                    <span
                      className={`text-[#89877f] transition max-[800px]:hidden ${expanded ? '-rotate-90' : 'rotate-90'}`}
                    >
                      <Icon name="chevron" size={13} />
                    </span>
                    <Icon name="folder" size={16} />
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap max-[800px]:hidden">
                      {suite.name}
                    </span>
                  </button>
                  {expanded && (
                    <div className="ml-[27px] grid max-[800px]:hidden">
                      {suite.tests.map((test) => (
                        <a
                          href="#/recorder"
                          key={test}
                          className="grid min-h-8 grid-cols-[15px_minmax(0,1fr)] items-center gap-1.5 rounded-full px-2 text-[13px] text-[#6e6d66] no-underline hover:bg-white/30 hover:text-[#292a25]"
                        >
                          <Icon name="file" size={13} />
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                            {test}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex-1" />
        <a
          className="mb-2 flex h-[42px] items-center gap-3 rounded-full px-3 text-[14px] text-[#62625b] no-underline hover:bg-white/30 hover:text-[#292a25] max-[800px]:mx-auto max-[800px]:h-11 max-[800px]:w-11 max-[800px]:justify-center max-[800px]:px-0"
          href="#/recorder"
        >
          <Icon name="settings" />
          <span className="max-[800px]:hidden">Settings</span>
        </a>
        <button className="grid h-[52px]! w-full grid-cols-[34px_1fr_auto] items-center gap-2 rounded-full! bg-white/25! p-2! text-left text-[#292a25]! hover:bg-white/40! max-[800px]:mx-auto max-[800px]:h-11! max-[800px]:w-11 max-[800px]:grid-cols-1 max-[800px]:place-items-center max-[800px]:p-1!">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#c9ded5] text-[10px] font-bold text-[#385149]">
            NS
          </span>
          <span className="min-w-0 max-[800px]:hidden">
            <strong className="block text-[12px] font-semibold">Nikita S.</strong>
            <small className="mt-0.5 block text-[10px] text-[#817f76]">Local workspace</small>
          </span>
          <span className="text-[#817f76] max-[800px]:hidden">
            <Icon name="dots" size={15} />
          </span>
        </button>
      </aside>

      <section className="relative z-10 min-w-0 overflow-auto bg-[#fbfaf7] shadow-[-16px_0_36px_rgb(70_61_52_/_18%)]">
        <header className="sticky top-0 z-20 flex h-[58px] items-center justify-between border-b border-[#e8e6df]/80 bg-[#fbfaf7]/90 px-7 pt-[6px] backdrop-blur-xl">
          <a href="#/" className="text-[12px] text-[#89877f] no-underline hover:text-[#292a25]">
            All designs
          </a>
          <div className="flex items-center gap-2">
            <button
              className="grid h-[34px]! w-[34px] place-items-center rounded-lg! bg-transparent! p-0! text-[#716f68]! hover:bg-[#f0eee8]!"
              aria-label="Search"
            >
              <Icon name="search" />
            </button>
            <button
              className="grid h-[34px]! w-[34px] place-items-center rounded-full! bg-[#c9ded5]! p-0! text-[10px] font-bold text-[#385149]!"
              aria-label="Account"
            >
              NS
            </button>
          </div>
        </header>

        <div className="mx-auto w-[min(880px,calc(100%-64px))] pb-14 pt-12 max-[800px]:w-[calc(100%-36px)] max-[800px]:pt-9">
          <section>
            <p className="mb-3 text-[10px] font-bold tracking-[0.11em] text-[#8b887f]">
              {selectedProject.name.toUpperCase()}
            </p>
            <h1 className="m-0 text-[clamp(30px,3vw,42px)] font-medium tracking-[-0.045em] text-[#282923]">
              Good morning, Nikita
            </h1>
            <span className="mt-2 block text-[15px] text-[#89877f]">
              What would you like to test today?
            </span>
          </section>

          <section
            className="mt-[30px] rounded-[15px] border border-[#dedbd2] bg-white p-[7px] shadow-[0_10px_30px_rgb(57_51_43_/_7%),0_1px_2px_rgb(57_51_43_/_5%)]"
            aria-label="Create a test"
          >
            <textarea
              className="block h-[82px] w-full resize-none border-0 bg-transparent px-[14px] py-[13px] text-[14px] text-[#292a25] outline-none placeholder:text-[#aaa79e]"
              aria-label="Describe a test"
              placeholder="Describe the flow you want to test…"
            />
            <div className="flex items-center justify-between p-0.5">
              <button className="flex h-[34px]! items-center gap-2 rounded-lg! bg-[#f5f3ee]! px-2.5! text-[12px] text-[#747169]!">
                <Icon name="sparkle" size={16} /> Production{' '}
                <span className="text-[#aaa79e]">⌄</span>
              </button>
              <button
                className="flex h-[34px]! items-center gap-2 rounded-lg! bg-[#292a25]! py-0! pl-3! pr-1! text-[12px] font-semibold text-white!"
                onClick={() => (window.location.hash = '#/recorder')}
              >
                Start recording
                <span className="grid h-6 w-6 place-items-center rounded-md bg-white/10">
                  <Icon name="chevron" size={15} />
                </span>
              </button>
            </div>
          </section>

          <section
            className="my-[46px] grid grid-cols-3 border-y border-[#e8e6df] max-[800px]:grid-cols-1"
            aria-label="Test statistics"
          >
            {[
              ['184', 'Total tests', '+12 this month'],
              ['92.3%', 'Pass rate', '+2.1% this month'],
              ['1m 38s', 'Avg. duration', '8.2% faster'],
            ].map(([value, label, detail], index) => (
              <div
                key={label}
                className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-6 py-[22px] ${index ? 'border-l border-[#e8e6df] max-[800px]:border-l-0 max-[800px]:border-t' : ''}`}
              >
                <strong className="row-span-2 self-center text-[24px] font-medium tracking-[-0.035em] text-[#34352f]">
                  {value}
                </strong>
                <span className="text-[11px] font-semibold text-[#585851]">{label}</span>
                <small className="text-[10px] text-[#8e8c84]">{detail}</small>
              </div>
            ))}
          </section>

          <section>
            <div className="mb-[14px] flex items-end justify-between">
              <div>
                <h2 className="m-0 text-[17px] font-semibold text-[#34352f]">Recent runs</h2>
                <p className="mt-1 text-[11px] text-[#99968d]">Your latest test activity</p>
              </div>
              <button className="flex h-[30px]! items-center gap-1 bg-transparent! p-0! text-[11px] text-[#6f6d65]!">
                View all <Icon name="chevron" size={14} />
              </button>
            </div>
            <div className="border-t border-[#e8e6df]">
              {recentRuns.map((run) => {
                const colors = runColors[run.status as keyof typeof runColors];
                return (
                  <button
                    key={run.name}
                    className="grid min-h-[62px]! w-full grid-cols-[34px_minmax(0,1fr)_90px_72px_16px] items-center gap-3 rounded-none! border-b border-[#e8e6df] bg-transparent! px-2! py-2! text-left text-[#45453f]! hover:bg-[#f5f3ee]!"
                  >
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-lg text-[12px] font-bold ${colors.icon}`}
                    >
                      {run.status === 'Passed' ? '✓' : run.status === 'Failed' ? '×' : '•••'}
                    </span>
                    <span>
                      <strong className="block text-[12px] font-semibold">{run.name}</strong>
                      <small className="mt-1 block text-[10px] text-[#99968d]">
                        {run.environment}
                      </small>
                    </span>
                    <time className="text-[10px] text-[#96948b]">{run.time}</time>
                    <span className={`text-[10px] font-semibold ${colors.status}`}>
                      {run.status}
                    </span>
                    <span className="text-[#aaa79e]">
                      <Icon name="chevron" size={15} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
};
