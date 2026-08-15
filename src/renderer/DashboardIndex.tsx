const dashboards = [
  {
    href: '#/dashboard',
    number: '01',
    title: 'Glass dashboard',
    description: 'The original data-rich dashboard with translucent panels and analytics.',
    className: 'gallery-glass',
  },
  {
    href: '#/dashboard2',
    number: '02',
    title: 'Codex-inspired',
    description: 'A quieter workspace with a flat sidebar and elevated, high-contrast canvas.',
    className: 'gallery-codex',
  },
];

export const DashboardIndex = () => (
  <main className="dashboard-gallery">
    <div className="gallery-content">
      <header>
        <span>TESTRON / UI STUDIES</span>
        <h1>Choose a dashboard</h1>
        <p>Two directions for the same testing workspace.</p>
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
                <span>Open →</span>
              </div>
              <p>{dashboard.description}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  </main>
);
