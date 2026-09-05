import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  DEFAULT_WORKSPACE_URL,
  forgetWorkspace,
  loadRecentWorkspaces,
  normalizeWorkspaceUrl,
  rememberWorkspace,
  saveRecentWorkspaces,
  workspaceOption,
  workspaceOptions,
  workspaceSignInUrl,
  type WorkspaceOption,
} from '../../../lib/workspaces';
import { Button, Icon, StatusDot } from '../../ui/design';

const desktopWorkspace = () => window.testronDesktop?.workspace;

/** The server this page will sign in to. */
export const currentWorkspace = (): WorkspaceOption => {
  const raw = desktopWorkspace()?.current ?? window.location.origin;
  return workspaceOption(normalizeWorkspaceUrl(raw) ?? raw);
};

/**
 * Which Testron server to sign in to. testron.dev is the default, but the app
 * is open source: anyone can point it at a server they run. On the web that
 * means leaving for the other server's sign-in page; on the desktop the shell
 * remembers the choice and restarts against it.
 */
export const WorkspacePicker = () => {
  const { t } = useTranslation();
  const desktop = desktopWorkspace();
  const current = currentWorkspace();
  const defaultUrl = desktop?.default ?? DEFAULT_WORKSPACE_URL;
  const [recent, setRecent] = useState<string[]>(() => desktop?.recent ?? loadRecentWorkspaces());
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const options = workspaceOptions(current.url, recent, defaultUrl);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (url: string) => {
    if (url === current.url) {
      setOpen(false);
      return;
    }
    if (window.testronDesktop?.selectWorkspace) {
      window.testronDesktop.selectWorkspace(url);
      return;
    }
    saveRecentWorkspaces(rememberWorkspace(recent, url));
    window.location.assign(workspaceSignInUrl(url));
  };

  const forget = (url: string) => {
    const next = forgetWorkspace(recent, url);
    setRecent(next);
    if (window.testronDesktop) window.testronDesktop.forgetWorkspace?.(url);
    else saveRecentWorkspaces(next);
  };

  const connect = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = normalizeWorkspaceUrl(draft);
    if (!url) {
      setInvalid(true);
      return;
    }
    choose(url);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('switch_workspace')}
        className="auth-field flex h-11 w-full items-center gap-2.5 rounded-lg border border-line pr-2.5 pl-3 text-left transition-colors hover:border-ink-3"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-accent-wash text-accent">
          <Icon name="server" size={14} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-4">
          <span className="truncate text-md font-medium text-ink">{current.host}</span>
          <span className="truncate text-xs text-ink-3">
            {current.kind === 'cloud' ? t('testron_cloud_default') : t('self_hosted_server')}
          </span>
        </span>
        <StatusDot tone="good" label="current" />
        <Icon name="select" size={14} className="shrink-0 text-ink-3" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('switch_workspace')}
          className="auth-popover absolute top-[calc(100%+6px)] right-0 left-0 z-20 overflow-hidden rounded-[10px] border border-line bg-surface"
        >
          <div className="px-3 pt-2.5 pb-1.5 text-xs font-semibold tracking-[0.1em] text-ink-3 uppercase">
            {t('sign_in_to')}
          </div>
          {options.map((option) => {
            const on = option.url === current.url;
            return (
              <div
                key={option.url}
                className={`mx-1.5 flex items-center gap-1 rounded-[7px] ${
                  on ? 'bg-raised' : 'hover:bg-raised/60'
                }`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-2 text-left"
                  onClick={() => choose(option.url)}
                >
                  <StatusDot tone={on ? 'good' : 'neutral'} label={on ? 'current' : 'workspace'} />
                  <span className="flex min-w-0 flex-col leading-4">
                    <span className="truncate text-md font-medium text-ink">{option.host}</span>
                    <span
                      className={`truncate text-xs text-ink-3 ${option.kind === 'custom' ? 'ui-mono' : ''}`}
                    >
                      {option.kind === 'cloud' ? t('testron_cloud_default') : option.url}
                    </span>
                  </span>
                  {on && <Icon name="check" size={14} className="ml-auto shrink-0 text-accent" />}
                </button>
                {!on && option.kind === 'custom' && (
                  <button
                    type="button"
                    aria-label={t('remove_server')}
                    title={t('remove_server')}
                    className="mr-1.5 grid h-6 w-6 shrink-0 place-items-center rounded text-ink-3 transition-colors hover:bg-raised hover:text-ink"
                    onClick={() => forget(option.url)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>
            );
          })}

          <div className="mx-1.5 my-2 border-t border-line-soft" />

          <form
            onSubmit={connect}
            className="mx-1.5 mb-1.5 rounded-[7px] border border-dashed border-accent/35 bg-accent-wash/50 p-2.5"
          >
            <div className="flex items-center gap-2 text-md font-medium text-ink">
              <Icon name="plus" size={14} className="text-accent" />
              {t('add_your_own_server')}
            </div>
            <div className="mt-2 flex gap-1.5">
              <input
                value={draft}
                autoFocus
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                aria-label={t('add_your_own_server')}
                aria-invalid={invalid || undefined}
                placeholder={t('server_url_placeholder')}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setInvalid(false);
                }}
                className="ui-mono h-[34px] min-w-0 flex-1 rounded-md border border-line bg-plane px-2.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent"
              />
              <Button type="submit" variant="primary" disabled={!draft.trim()}>
                {t('connect')}
              </Button>
            </div>
            <p className={`mt-2 text-xs leading-4 ${invalid ? 'text-critical' : 'text-ink-3'}`}>
              {invalid ? t('invalid_server_url') : t('open_source_server_hint')}
            </p>
          </form>
        </div>
      )}
    </div>
  );
};
