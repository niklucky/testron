import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useState, type FormEvent } from 'react';

import { ACCOUNT_PASSWORD_MIN_LENGTH } from '@testron/protocol';
import type { LibrarySnapshot } from '../../../lib/library';
import { Button, Icon, IconButton, PulseDot, useTheme } from '../../ui/design';
import { authenticationErrorMessage, type Authenticate } from './authentication';

type ServerState = NonNullable<LibrarySnapshot['server']>;
type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

export const AuthenticationLoading = () => {
  const { t } = useTranslation();
  return (
    <main className="ui-root grid h-screen w-screen place-items-center bg-plane font-sans text-ink antialiased">
      <div className="flex items-center gap-2 text-ink-2">
        <PulseDot label={t('loading_testron')} />
        {t('connecting_to_your_workspace')}
      </div>
    </main>
  );
};

/* The public site links straight to registration with `?mode=register`; any
   other value lands on the sign-in tab. */
const requestedMode = (): AuthMode => {
  if (window.location.pathname === '/reset-password') return 'reset';
  return new URLSearchParams(window.location.search).get('mode') === 'register'
    ? 'register'
    : 'login';
};

export const AuthLanding = ({
  server,
  authenticate,
}: {
  server: ServerState;
  authenticate: Authenticate;
}) => {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<AuthMode>(requestedMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authenticationError, setAuthenticationError] = useState<string>();
  const [completed, setCompleted] = useState(false);
  const authenticating = submitting || server.authentication === 'authenticating';
  const resetToken = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
  }, []);

  const chooseMode = (next: AuthMode) => {
    setMode(next);
    setPassword('');
    setCompleted(false);
    setAuthenticationError(undefined);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !server.configured ||
      authenticating ||
      (mode !== 'reset' && !email.trim()) ||
      (mode !== 'forgot' && password.length < ACCOUNT_PASSWORD_MIN_LENGTH) ||
      (mode === 'reset' && !resetToken) ||
      (mode === 'register' && !name.trim())
    )
      return;
    setSubmitting(true);
    setAuthenticationError(undefined);
    const request =
      mode === 'login'
        ? ({ mode, email: email.trim(), password } as const)
        : mode === 'register'
          ? ({ mode, name: name.trim(), email: email.trim(), password } as const)
          : mode === 'forgot'
            ? ({ mode, email: email.trim() } as const)
            : ({
                mode,
                token: resetToken ?? '',
                newPassword: password,
              } as const);
    void authenticate(request)
      .then(() => {
        if (mode === 'forgot' || mode === 'reset') setCompleted(true);
      })
      .catch((error: unknown) => setAuthenticationError(authenticationErrorMessage(error)))
      .finally(() => setSubmitting(false));
  };

  const error =
    authenticationError ??
    (mode === 'reset' && !resetToken
      ? 'This password reset link is invalid or incomplete.'
      : server.message);
  const disabled =
    !server.configured ||
    authenticating ||
    (mode !== 'reset' && !email.trim()) ||
    (mode !== 'forgot' && password.length < ACCOUNT_PASSWORD_MIN_LENGTH) ||
    (mode === 'reset' && !resetToken) ||
    (mode === 'register' && !name.trim());

  return (
    <main className="ui-root flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <header className="flex h-14 shrink-0 items-center border-b border-line px-5 [-webkit-app-region:drag]">
        <div className="w-[66px] shrink-0" />
        <div className="flex items-center gap-2.5">
          <span className="ui-mono grid h-7 w-7 place-items-center rounded-[7px] bg-accent font-bold text-accent-ink">
            {t('t')}
          </span>
          <span className="font-semibold tracking-[-0.01em]">{t('testron')}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-ink-3 [-webkit-app-region:no-drag]">
          <Icon name="shield" size={14} />
          {t('alpha_workspace')}
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            size="sm"
            label={theme === 'dark' ? t('switch_to_light') : t('switch_to_dark')}
            onClick={toggle}
          />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 place-items-center overflow-auto px-8 py-12">
        <div className="grid w-full max-w-[920px] grid-cols-[minmax(0,1fr)_390px] gap-16">
          <section className="flex flex-col justify-center">
            <div className="mb-5 flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-ink-2">
              <PulseDot label={t('remote_workspace_available')} />
              {t('remote_workspace')}
            </div>
            <h1 className="max-w-[520px] text-[38px] leading-[1.08] font-semibold tracking-[-0.035em] text-ink">
              {t('tests_live_on_your_server_recording_stays_here')}
            </h1>
            <p className="mt-5 max-w-[500px] leading-6 text-ink-2">
              Sign in to open your projects and revisions. Testron keeps browser automation, local
              replay, traces, and unfinished drafts on this computer.
            </p>

            <div className="mt-8 grid gap-4 text-ink-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent-wash text-accent">
                  <Icon name="shield" size={14} />
                </span>
                <div>
                  <strong className="block font-medium text-ink">
                    {t('session_stays_in_electron_main')}
                  </strong>
                  <span className="text-ink-3">
                    {t('the_encrypted_access_token_never_reaches_tested_websites')}
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent-wash text-accent">
                  <Icon name="check" size={14} />
                </span>
                <div>
                  <strong className="block font-medium text-ink">
                    {t('one_canonical_workspace')}
                  </strong>
                  <span className="text-ink-3">
                    {t('the_desktop_loads_current_server_data_without_copying_the_databa')}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="self-center rounded-xl border border-line bg-surface p-7 shadow-[0_22px_60px_rgba(0,0,0,0.22)]">
            {(mode === 'login' || mode === 'register') && (
              <div className="grid grid-cols-2 rounded-lg border border-line bg-plane p-1">
                <button
                  type="button"
                  className={`h-8 rounded-md font-medium transition-colors ${
                    mode === 'login' ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'
                  }`}
                  aria-pressed={mode === 'login'}
                  onClick={() => chooseMode('login')}
                >
                  {t('sign_in')}
                </button>
                <button
                  type="button"
                  className={`h-8 rounded-md font-medium transition-colors ${
                    mode === 'register' ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'
                  }`}
                  aria-pressed={mode === 'register'}
                  onClick={() => chooseMode('register')}
                >
                  {t('create_account')}
                </button>
              </div>
            )}

            <form className="mt-6" onSubmit={submit}>
              <span className="ui-mono tracking-[0.12em] text-accent uppercase">
                {mode === 'login'
                  ? t('testron_account')
                  : mode === 'register'
                    ? t('alpha_registration')
                    : 'Account recovery'}
              </span>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
                {mode === 'login'
                  ? t('welcome_back')
                  : mode === 'register'
                    ? t('create_your_account')
                    : mode === 'forgot'
                      ? 'Reset your password'
                      : 'Choose a new password'}
              </h2>
              <p className="mt-2 leading-5 text-ink-2">
                {mode === 'login'
                  ? t('use_the_credentials_attached_to_your_workspace')
                  : mode === 'register'
                    ? t('create_an_account_and_enter_your_new_workspace_immediately')
                    : mode === 'forgot'
                      ? 'Enter your email and we’ll send you a secure reset link.'
                      : 'Enter the new password you want to use for your account.'}
              </p>

              {completed && (
                <div
                  className="mt-5 rounded-md border border-accent/30 bg-accent-wash px-3 py-3 leading-5 text-ink-2"
                  role="status"
                >
                  {mode === 'forgot'
                    ? 'If an account exists for that email, a reset link is on its way.'
                    : 'Your password has been reset. You can now sign in with your new password.'}
                </div>
              )}

              {!completed && mode === 'register' && (
                <label className="mt-6 block">
                  <span className="font-medium text-ink-2">{t('name')}</span>
                  <input
                    autoFocus
                    required
                    maxLength={100}
                    type="text"
                    autoComplete="name"
                    aria-label={t('name')}
                    value={name}
                    disabled={authenticating}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('your_name')}
                    className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-ink outline-none placeholder:text-ink-3 focus:border-accent"
                  />
                </label>
              )}

              {!completed && mode !== 'reset' && (
                <label className={`${mode === 'register' ? 'mt-4' : 'mt-6'} block`}>
                  <span className="font-medium text-ink-2">{t('email_address')}</span>
                  <input
                    autoFocus={mode === 'login'}
                    required
                    type="email"
                    autoComplete="email"
                    aria-label={t('email_address')}
                    value={email}
                    disabled={authenticating}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('you_company_com')}
                    className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-ink outline-none placeholder:text-ink-3 focus:border-accent"
                  />
                </label>
              )}

              {!completed && mode !== 'forgot' && (
                <label className="mt-4 block">
                  <span className="font-medium text-ink-2">
                    {mode === 'reset' ? 'New password' : t('password')}
                  </span>
                  <input
                    required
                    minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
                    maxLength={200}
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    aria-label={mode === 'reset' ? 'New password' : t('password')}
                    value={password}
                    disabled={authenticating}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t('at_least_8_characters')}
                    className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-ink outline-none placeholder:text-ink-3 focus:border-accent"
                  />
                </label>
              )}

              {!completed && mode === 'login' && (
                <button
                  type="button"
                  className="mt-3 text-accent hover:underline"
                  onClick={() => chooseMode('forgot')}
                >
                  Forgot password?
                </button>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-md border border-critical/30 bg-critical-wash px-3 py-2.5 leading-5 text-ink-2"
                >
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-critical" />
                  {error}
                </div>
              )}

              {!completed && (
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
                      ? t('signing_in')
                      : mode === 'register'
                        ? t('creating_account')
                        : 'Submitting…'
                    : mode === 'login'
                      ? t('sign_in')
                      : mode === 'register'
                        ? t('create_account')
                        : mode === 'forgot'
                          ? 'Send reset link'
                          : 'Reset password'}
                </Button>
              )}

              {(mode === 'forgot' || mode === 'reset') && (
                <button
                  type="button"
                  className="mt-4 block w-full text-center text-accent hover:underline"
                  onClick={() => {
                    if (window.location.pathname === '/reset-password')
                      window.location.href = '/login';
                    else chooseMode('login');
                  }}
                >
                  Back to sign in
                </button>
              )}

              {server.configured ? (
                <p className="mt-4 text-center leading-4 text-ink-3">
                  {t('alpha_access_uses_direct_email_and_password_authentication')}
                </p>
              ) : (
                <div className="mt-5 border-t border-line-soft pt-5 text-center leading-5 text-ink-3">
                  {t('this_build_does_not_have_a_server_address_configured')}
                </div>
              )}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
};
