import { useEffect, useState, type FormEvent } from 'react';

import type { LibrarySnapshot } from '../../main/persistence/repository';
import { Button, Icon, IconButton, PulseDot, useTheme } from '../design';

type ServerState = NonNullable<LibrarySnapshot['server']>;
type AuthMode = 'login' | 'register';

export const AuthenticationLoading = () => (
  <main className="ui-root grid h-screen w-screen place-items-center bg-plane font-sans text-ink antialiased">
    <div className="flex items-center gap-2 text-base text-ink-2">
      <PulseDot label="Loading Testron" />
      Connecting to your workspace…
    </div>
  </main>
);

export const AuthLanding = ({ server }: { server: ServerState }) => {
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string>();
  const authenticating = server.authentication === 'authenticating';

  useEffect(() => {
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
  }, []);

  const chooseMode = (next: AuthMode) => {
    setMode(next);
    setPassword('');
    setConfirmation('');
    setLocalError(undefined);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(undefined);
    if (!server.configured || authenticating || !email.trim() || password.length < 12) return;
    if (mode === 'register' && password !== confirmation) {
      setLocalError('The passwords do not match.');
      return;
    }
    window.testron?.command({
      type: mode === 'login' ? 'login-server' : 'register-server',
      email: email.trim(),
      password,
    });
  };

  const error = localError ?? server.message;
  const disabled =
    !server.configured ||
    authenticating ||
    !email.trim() ||
    password.length < 12 ||
    (mode === 'register' && confirmation.length < 12);

  return (
    <main className="ui-root flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <header className="flex h-14 shrink-0 items-center border-b border-line px-5 [-webkit-app-region:drag]">
        <div className="w-[66px] shrink-0" />
        <div className="flex items-center gap-2.5">
          <span className="ui-mono grid h-7 w-7 place-items-center rounded-[7px] bg-accent text-md font-bold text-accent-ink">
            T
          </span>
          <span className="text-md font-semibold tracking-[-0.01em]">Testron</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-ink-3 [-webkit-app-region:no-drag]">
          <Icon name="shield" size={14} />
          Alpha workspace
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            size="sm"
            label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            onClick={toggle}
          />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 place-items-center overflow-auto px-8 py-12">
        <div className="grid w-full max-w-[920px] grid-cols-[minmax(0,1fr)_390px] gap-16">
          <section className="flex flex-col justify-center">
            <div className="mb-5 flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2">
              <PulseDot label="Remote workspace available" />
              Remote workspace
            </div>
            <h1 className="max-w-[520px] text-[38px] leading-[1.08] font-semibold tracking-[-0.035em] text-ink">
              Tests live on your server. Recording stays here.
            </h1>
            <p className="mt-5 max-w-[500px] text-md leading-6 text-ink-2">
              Sign in to open your projects and revisions. Testron keeps browser automation, local
              replay, traces, and unfinished drafts on this computer.
            </p>

            <div className="mt-8 grid gap-4 text-base text-ink-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent-wash text-accent">
                  <Icon name="shield" size={14} />
                </span>
                <div>
                  <strong className="block font-medium text-ink">
                    Session stays in Electron main
                  </strong>
                  <span className="text-sm text-ink-3">
                    The encrypted access token never reaches tested websites.
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent-wash text-accent">
                  <Icon name="check" size={14} />
                </span>
                <div>
                  <strong className="block font-medium text-ink">One canonical workspace</strong>
                  <span className="text-sm text-ink-3">
                    The desktop loads current server data without copying the database.
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="self-center rounded-xl border border-line bg-surface p-7 shadow-[0_22px_60px_rgba(0,0,0,0.22)]">
            <div className="grid grid-cols-2 rounded-lg border border-line bg-plane p-1">
              <button
                type="button"
                className={`h-8 rounded-md text-sm font-medium transition-colors ${
                  mode === 'login' ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'
                }`}
                aria-pressed={mode === 'login'}
                onClick={() => chooseMode('login')}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`h-8 rounded-md text-sm font-medium transition-colors ${
                  mode === 'register' ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'
                }`}
                aria-pressed={mode === 'register'}
                onClick={() => chooseMode('register')}
              >
                Create account
              </button>
            </div>

            <form className="mt-6" onSubmit={submit}>
              <span className="ui-mono text-xs tracking-[0.12em] text-accent uppercase">
                {mode === 'login' ? 'Testron account' : 'Alpha registration'}
              </span>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="mt-2 text-base leading-5 text-ink-2">
                {mode === 'login'
                  ? 'Use the credentials attached to your workspace.'
                  : 'Create an account and enter your new workspace immediately.'}
              </p>

              <label className="mt-6 block">
                <span className="text-sm font-medium text-ink-2">Email address</span>
                <input
                  autoFocus
                  required
                  type="email"
                  autoComplete="email"
                  aria-label="Email address"
                  value={email}
                  disabled={authenticating}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-md text-ink outline-none placeholder:text-ink-3 focus:border-accent"
                />
              </label>

              <label className="mt-4 block">
                <span className="text-sm font-medium text-ink-2">Password</span>
                <input
                  required
                  minLength={12}
                  maxLength={200}
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  aria-label="Password"
                  value={password}
                  disabled={authenticating}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 12 characters"
                  className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-md text-ink outline-none placeholder:text-ink-3 focus:border-accent"
                />
              </label>

              {mode === 'register' && (
                <label className="mt-4 block">
                  <span className="text-sm font-medium text-ink-2">Confirm password</span>
                  <input
                    required
                    minLength={12}
                    maxLength={200}
                    type="password"
                    autoComplete="new-password"
                    aria-label="Confirm password"
                    value={confirmation}
                    disabled={authenticating}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-md text-ink outline-none focus:border-accent"
                  />
                </label>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-md border border-critical/30 bg-critical-wash px-3 py-2.5 text-sm leading-5 text-ink-2"
                >
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-critical" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                className="mt-5 justify-center"
                disabled={disabled}
              >
                {authenticating
                  ? mode === 'login'
                    ? 'Signing in…'
                    : 'Creating account…'
                  : mode === 'login'
                    ? 'Sign in'
                    : 'Create account'}
              </Button>

              {server.configured ? (
                <p className="mt-4 text-center text-xs leading-4 text-ink-3">
                  Alpha access uses direct email and password authentication.
                </p>
              ) : (
                <div className="mt-5 border-t border-line-soft pt-5 text-center text-sm leading-5 text-ink-3">
                  This build does not have a server address configured.
                </div>
              )}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
};
