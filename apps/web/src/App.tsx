import { Downloads } from './components/Downloads';
import { ArrowIcon, CheckIcon } from './components/Icons';
import { appUrl, repositoryUrl, signInUrl, signUpUrl } from './lib/downloads';

const promises = [
  'Record clicks, typing and assertions in a real browser',
  'Export deterministic Playwright TypeScript, no AI in the path',
  'Keep tests, revisions and run results on your own server',
];

export const App = () => (
  <div className="flex min-h-screen flex-col">
    <header className="flex h-14 items-center justify-between px-5 sm:px-8">
      <span className="flex items-center gap-2">
        <img className="h-6 w-6" src="/testron-mark.png" alt="" />
        <span className="font-medium">Testron</span>
      </span>
      <nav className="flex items-center gap-2">
        <a
          className="inline-flex h-8 items-center rounded-md px-3 text-md font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          href={signInUrl}
        >
          Sign in
        </a>
        <a
          className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-md font-medium text-ink-2 transition-colors hover:text-ink"
          href={signUpUrl}
        >
          Sign up
        </a>
      </nav>
    </header>

    <main className="flex flex-1 justify-center px-5 pb-16 sm:px-8">
      <div className="w-full max-w-[560px] pt-10 sm:pt-16">
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-32 w-32 items-center justify-center">
            <span className="site-glow absolute inset-[-40%]" aria-hidden="true" />
            <img
              className="relative h-32 w-32"
              src="/testron-mark.png"
              alt="Testron"
              width={128}
              height={128}
            />
          </div>

          <span className="mt-6 inline-flex h-6 items-center rounded-full bg-warning-wash px-2.5 text-md font-medium text-warning-ink">
            Alpha
          </span>

          {/* The product type scale stops where the console needs it to; the one
              headline on this page is sized for a page, not for a panel. */}
          <h1 className="mt-4 text-[36px] leading-[1.1] font-semibold tracking-tight sm:text-[44px]">
            Record your app.
            <br />
            Ship Playwright tests.
          </h1>

          <p className="mt-4 text-lg text-ink-2">
            Testron records browser interactions, captures assertions, and turns them into
            deterministic Playwright TypeScript your team can read, run and keep in Git.
          </p>
        </div>

        <div className="mt-8">
          <Downloads />
        </div>

        <ul className="mt-6 space-y-2">
          {promises.map((promise) => (
            <li key={promise} className="flex items-start gap-2 text-md text-ink-2">
              <span className="mt-1 text-good">
                <CheckIcon />
              </span>
              {promise}
            </li>
          ))}
        </ul>

        <section
          className="mt-6 rounded-xl border border-line bg-surface p-5"
          aria-labelledby="account-heading"
        >
          <h2 id="account-heading" className="text-lg font-medium">
            Your workspace lives on the web
          </h2>
          <p className="mt-1 text-md text-ink-2">
            Projects, suites, run history and triage are at{' '}
            <span className="ui-mono text-ink">app.testron.dev</span>. The desktop app signs in with
            the same account.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 font-medium text-accent-ink transition-[filter] hover:brightness-110"
              href={signUpUrl}
            >
              Create an account
              <ArrowIcon />
            </a>
            <a
              className="inline-flex h-9 items-center rounded-md border border-line bg-raised px-3 font-medium text-ink-2 transition-colors hover:text-ink"
              href={signInUrl}
            >
              Sign in
            </a>
          </div>
        </section>
      </div>
    </main>

    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 pb-8 text-md text-ink-3">
      <span>© {new Date().getFullYear()} Testron</span>
      <a className="transition-colors hover:text-ink-2" href={appUrl}>
        Web app
      </a>
      <a className="transition-colors hover:text-ink-2" href={repositoryUrl}>
        GitHub
      </a>
    </footer>
  </div>
);
