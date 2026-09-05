import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { ACCOUNT_PASSWORD_MIN_LENGTH } from '@testron/protocol';
import mark from '../../../assets/testron-mark.png';
import type { LibrarySnapshot } from '../../../lib/library';
import { Badge, Button, Icon, IconButton, PulseDot, useTheme } from '../../ui/design';
import { authenticationErrorMessage, type Authenticate } from './authentication';
import { WorkspacePicker, currentWorkspace } from './WorkspacePicker';

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

const fieldClass =
  'auth-field mt-1.5 h-10 w-full rounded-lg border border-line px-3 text-md text-ink outline-none placeholder:text-ink-3';

/** Language and theme, the two things worth changing before signing in. */
const ShellControls = ({ compact }: { compact: boolean }) => {
  const { locale, setLocale, t } = useTranslation();
  const { theme, toggle } = useTheme();
  return (
    <div className="flex items-center gap-1.5 text-ink-2 [-webkit-app-region:no-drag]">
      <label>
        <span className="sr-only">{t('language')}</span>
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
          className={`auth-field rounded-md border border-line text-ink outline-none ${
            compact ? 'h-7 px-1.5 text-sm' : 'h-8 px-2 text-md'
          }`}
        >
          <option value="en">{t('english')}</option>
          <option value="ru">{t('russian')}</option>
        </select>
      </label>
      <IconButton
        icon={theme === 'dark' ? 'sun' : 'moon'}
        size="sm"
        label={theme === 'dark' ? t('switch_to_light') : t('switch_to_dark')}
        onClick={toggle}
      />
    </div>
  );
};

const Fact = ({
  index,
  label,
  title,
  body,
}: Record<'index' | 'label' | 'title' | 'body', string>) => (
  <div className="flex flex-col gap-1.5">
    <span className="ui-mono text-xs tracking-[0.12em] text-accent uppercase">
      {index} · {label}
    </span>
    <strong className="text-md font-medium text-ink">{title}</strong>
    <span className="text-sm leading-[19px] text-ink-3">{body}</span>
  </div>
);

export const AuthLanding = ({
  server,
  authenticate,
}: {
  server: ServerState;
  authenticate: Authenticate;
}) => {
  const { t } = useTranslation();
  const desktop = window.testronDesktop;
  const compact = desktop !== undefined;
  const glass = desktop?.workspace?.glass === true;
  const workspace = currentWorkspace();
  const [mode, setMode] = useState<AuthMode>(requestedMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealPassword, setRevealPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authenticationError, setAuthenticationError] = useState<string>();
  const [completed, setCompleted] = useState(false);
  const authenticating = submitting || server.authentication === 'authenticating';
  const resetToken = new URLSearchParams(window.location.search).get('token');
  const recovery = mode === 'forgot' || mode === 'reset';

  // The desktop shrinks to a compact card while this screen is up.
  useEffect(() => {
    desktop?.setSurface?.('auth');
  }, [desktop]);

  // With vibrancy behind the window, the page must not paint its own plane.
  useEffect(() => {
    if (!glass) return;
    document.documentElement.dataset.shell = 'glass';
    return () => {
      delete document.documentElement.dataset.shell;
    };
  }, [glass]);

  const chooseMode = (next: AuthMode) => {
    setMode(next);
    setPassword('');
    setRevealPassword(false);
    setCompleted(false);
    setAuthenticationError(undefined);
  };

  const disabled =
    !server.configured ||
    authenticating ||
    (mode !== 'reset' && !email.trim()) ||
    (mode !== 'forgot' && password.length < ACCOUNT_PASSWORD_MIN_LENGTH) ||
    (mode === 'reset' && !resetToken) ||
    (mode === 'register' && !name.trim());

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    setAuthenticationError(undefined);
    const request =
      mode === 'login'
        ? ({ mode, email: email.trim(), password } as const)
        : mode === 'register'
          ? ({ mode, name: name.trim(), email: email.trim(), password } as const)
          : mode === 'forgot'
            ? ({ mode, email: email.trim() } as const)
            : ({ mode, token: resetToken ?? '', newPassword: password } as const);
    void authenticate(request)
      .then(() => {
        if (recovery) setCompleted(true);
      })
      .catch((error: unknown) => setAuthenticationError(authenticationErrorMessage(error)))
      .finally(() => setSubmitting(false));
  };

  const error =
    authenticationError ??
    (mode === 'reset' && !resetToken ? t('reset_link_invalid') : server.message);

  const title =
    mode === 'login'
      ? t('welcome_back')
      : mode === 'register'
        ? t('create_your_account')
        : mode === 'forgot'
          ? t('reset_your_password')
          : t('choose_a_new_password');
  const subtitle =
    mode === 'login'
      ? t('tests_live_on_your_server_recording_stays_here')
      : mode === 'register'
        ? t('create_an_account_and_enter_your_new_workspace_immediately')
        : mode === 'forgot'
          ? t('forgot_password_intro')
          : t('reset_password_intro');
  const action = authenticating
    ? mode === 'login'
      ? t('signing_in')
      : mode === 'register'
        ? t('creating_account')
        : t('submitting')
    : mode === 'login'
      ? t('sign_in_to_host', { host: workspace.host })
      : mode === 'register'
        ? t('create_account')
        : mode === 'forgot'
          ? t('send_reset_link')
          : t('reset_password');

  const passwordLabel = mode === 'reset' ? t('new_password') : t('password');

  const form = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {!recovery && (
        <div
          role="tablist"
          aria-label={t('testron_account')}
          className="auth-field grid grid-cols-2 gap-0.5 rounded-[10px] border border-line p-1"
        >
          {(['login', 'register'] as const).map((item) => {
            const on = mode === item;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={on}
                className={`h-8 rounded-[7px] text-md font-medium transition-colors ${
                  on
                    ? 'bg-raised text-ink shadow-[0_1px_2px_rgba(0,0,0,0.35)]'
                    : 'text-ink-3 hover:text-ink-2'
                }`}
                onClick={() => chooseMode(item)}
              >
                {item === 'login' ? t('sign_in') : t('create_account')}
              </button>
            );
          })}
        </div>
      )}

      {recovery && !compact && (
        <div>
          <span className="ui-mono text-sm tracking-[0.12em] text-accent uppercase">
            {t('account_recovery')}
          </span>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="mt-2 text-md leading-5 text-ink-2">{subtitle}</p>
        </div>
      )}

      {!recovery && (
        <div>
          <span className="block text-xs font-semibold tracking-[0.1em] text-ink-3 uppercase">
            {t('workspace')}
          </span>
          <div className="mt-2">
            <WorkspacePicker />
          </div>
        </div>
      )}

      {completed && (
        <div
          className="rounded-lg border border-accent/30 bg-accent-wash px-3 py-3 text-md leading-5 text-ink-2"
          role="status"
        >
          {mode === 'forgot' ? t('reset_link_sent') : t('password_reset_done')}
        </div>
      )}

      {!completed && (
        <div className="flex flex-col gap-3.5">
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-name" className="text-sm font-medium text-ink-2">
                {t('name')}
              </label>
              <input
                id="auth-name"
                autoFocus
                required
                maxLength={100}
                type="text"
                autoComplete="name"
                value={name}
                disabled={authenticating}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('your_name')}
                className={fieldClass}
              />
            </div>
          )}

          {mode !== 'reset' && (
            <div>
              <label htmlFor="auth-email" className="text-sm font-medium text-ink-2">
                {t('email_address')}
              </label>
              <input
                id="auth-email"
                autoFocus={mode !== 'register'}
                required
                type="email"
                autoComplete="email"
                value={email}
                disabled={authenticating}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('you_company_com')}
                className={fieldClass}
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="auth-password" className="text-sm font-medium text-ink-2">
                  {passwordLabel}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    className="text-sm text-accent hover:underline"
                    onClick={() => chooseMode('forgot')}
                  >
                    {t('forgot_password')}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-password"
                  autoFocus={mode === 'reset'}
                  required
                  minLength={ACCOUNT_PASSWORD_MIN_LENGTH}
                  maxLength={200}
                  type={revealPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  disabled={authenticating}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('at_least_8_characters')}
                  className={`${fieldClass} pr-10`}
                />
                <IconButton
                  icon="eye"
                  size="sm"
                  label={revealPassword ? t('hide_password') : t('show_password')}
                  active={revealPassword}
                  className="absolute top-1/2 right-2 -translate-y-1/2"
                  onClick={() => setRevealPassword((value) => !value)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-critical/30 bg-critical-wash px-3 py-2.5 text-md leading-5 text-ink-2"
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
          className="auth-primary mt-1 justify-center text-md font-semibold"
          disabled={disabled}
        >
          {action}
        </Button>
      )}

      {recovery && (
        <button
          type="button"
          className="text-center text-md text-accent hover:underline"
          onClick={() => {
            if (window.location.pathname === '/reset-password') window.location.href = '/login';
            else chooseMode('login');
          }}
        >
          {t('back_to_sign_in')}
        </button>
      )}
    </form>
  );

  const footer = server.configured ? (
    <div className="flex items-center justify-center gap-1.5 text-center text-xs leading-4 text-ink-3">
      <Icon name="shield" size={12} className="shrink-0" />
      {compact
        ? t('your_token_stays_encrypted')
        : t('alpha_access_uses_direct_email_and_password_authentication')}
    </div>
  ) : (
    <div className="text-center text-sm leading-5 text-ink-3">
      {t('this_build_does_not_have_a_server_address_configured')}
    </div>
  );

  if (compact)
    return (
      <CompactShell glass={glass} title={title} subtitle={subtitle} footer={footer}>
        {form}
      </CompactShell>
    );

  return (
    <main className="ui-root relative flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <div className="auth-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="auth-glow pointer-events-none absolute top-[18%] left-[6%] h-[640px] w-[640px] rounded-full"
        aria-hidden="true"
      />

      <header className="relative flex h-[60px] shrink-0 items-center justify-between px-7">
        <div className="flex items-center gap-2.5">
          <img src={mark} alt="" width={28} height={28} className="h-7 w-7" />
          <span className="font-semibold tracking-[-0.01em]">{t('testron')}</span>
          <Badge tone="accent" uppercase className="ml-1">
            {t('alpha')}
          </Badge>
        </div>
        <ShellControls compact={false} />
      </header>

      <div className="relative grid min-h-0 flex-1 place-items-center overflow-auto px-8 py-8">
        <div className="auth-rise grid w-full max-w-[1120px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-24">
          <section className="flex max-w-[560px] flex-col items-start">
            <img
              src={mark}
              alt={t('testron')}
              width={176}
              height={176}
              className="auth-mark -ml-3 h-28 w-28 lg:h-44 lg:w-44"
            />
            <div className="mt-6 flex h-[26px] items-center gap-2 rounded-full border border-line bg-surface/70 pr-2.5 pl-2 text-sm text-ink-2">
              <PulseDot label="remote_workspace_available" />
              {t('connected_to_host', { host: workspace.host })}
            </div>
            <h1 className="mt-5 text-[38px] leading-[1.06] font-semibold tracking-[-0.035em] text-balance text-ink lg:text-[46px]">
              {t('tests_live_on_your_server_recording_stays_here')}
            </h1>
            <p className="mt-5 max-w-[480px] text-lg leading-[25px] text-ink-2">
              {t('auth_intro')}
            </p>

            <div className="mt-9 hidden max-w-[560px] grid-cols-3 gap-7 border-t border-line-soft pt-6 lg:grid">
              <Fact
                index="01"
                label={t('session_fact_label')}
                title={t('token_stays_in_electron_main')}
                body={t('the_encrypted_access_token_never_reaches_tested_websites')}
              />
              <Fact
                index="02"
                label={t('workspace_fact_label')}
                title={t('one_canonical_workspace')}
                body={t('the_desktop_loads_current_server_data_without_copying_the_databa')}
              />
              <Fact
                index="03"
                label={t('open_source_fact_label')}
                title={t('bring_your_own_server')}
                body={t('bring_your_own_server_hint')}
              />
            </div>
          </section>

          <section className="auth-card flex flex-col gap-5 rounded-2xl border p-6 lg:p-7">
            {form}
            <div className="border-t border-line-soft pt-4">{footer}</div>
          </section>
        </div>
      </div>

      <footer className="relative hidden h-12 shrink-0 items-center justify-between px-8 text-sm text-ink-3 [@media(min-height:820px)]:flex">
        <span>{t('open_source_mit')}</span>
        <span className="ui-mono">{t('alpha_workspace')}</span>
      </footer>
    </main>
  );
};

/**
 * The desktop sign-in window: one column inside a compact glass card. The
 * shell paints vibrancy behind a transparent page, so this only tints it.
 */
const CompactShell = ({
  glass,
  title,
  subtitle,
  footer,
  children,
}: {
  glass: boolean;
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <main
      className={`ui-root flex h-screen w-screen flex-col overflow-hidden font-sans text-ink antialiased ${
        glass ? 'auth-glass' : 'bg-plane'
      }`}
    >
      <header className="flex h-[52px] shrink-0 items-center justify-end px-3 [-webkit-app-region:drag]">
        <ShellControls compact />
      </header>
      <div className="auth-rise flex min-h-0 flex-1 flex-col items-center overflow-auto px-10 pb-5">
        <img
          src={mark}
          alt={t('testron')}
          width={88}
          height={88}
          className="auth-mark h-[88px] w-[88px] shrink-0"
        />
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 text-center text-sm leading-[18px] text-ink-2">{subtitle}</p>
        <div className="mt-5 w-full max-w-[380px]">{children}</div>
        <div className="mt-auto w-full max-w-[380px] pt-5">{footer}</div>
      </div>
    </main>
  );
};
