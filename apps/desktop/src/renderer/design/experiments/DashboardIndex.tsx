import { useTranslation } from '@warpunit/slang-react';
const dashboards = [
  {
    href: '#/experiments/glass',
    number: '01',
    title: 'Glass dashboard',
    description: 'The original data-rich dashboard with translucent panels and analytics.',
    className: 'gallery-glass',
  },
  {
    href: '#/experiments/codex',
    number: '02',
    title: 'Codex-inspired',
    description: 'A quieter workspace with a flat sidebar and elevated, high-contrast canvas.',
    className: 'gallery-codex',
  },
  {
    href: '#/experiments/workspace',
    number: '03',
    title: 'Workspace',
    description: 'A dense project workspace: suite tree in the sidebar, analytics on the canvas.',
    className: 'gallery-workspace',
  },
  {
    href: '#/',
    number: '04',
    title: 'Flight Deck',
    description: 'Suite tree, dashboard and a keyboard-first triage console. Now the main app.',
    className: 'gallery-deck',
  },
];

export const DashboardIndex = () => {
  const { t } = useTranslation();
  return (
    <main className="dashboard-gallery">
      <div className="gallery-content">
        <header>
          <span>{t('testron_ui_studies')}</span>
          <h1>{t('choose_a_dashboard')}</h1>
          <p>{t('four_directions_for_the_same_testing_workspace_04_shipped')}</p>
        </header>
        <div className="gallery-grid">
          {dashboards.map((dashboard) => (
            <a href={dashboard.href} key={dashboard.href} className="gallery-card">
              <div className={`gallery-preview ${dashboard.className}`}>
                <i className="gallery-sidebar" />
                <i className="gallery-canvas" />
                <span>{dashboard.number}</span>
              </div>
              <div className="gallery-card-copy">
                <div>
                  <strong>{dashboard.title}</strong>
                  <span>{t('open_2')}</span>
                </div>
                <p>{dashboard.description}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
};
