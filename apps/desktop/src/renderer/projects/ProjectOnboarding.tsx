import { useEffect, useState, type FormEvent } from 'react';

import type { LibrarySnapshot } from '../../main/persistence/repository';
import { Button, Icon, IconButton, PulseDot, useTheme } from '../design';
import { viewerLabel } from './access';

export const ProjectOnboarding = ({ library }: { library: LibrarySnapshot }) => {
  const { theme, toggle } = useTheme();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [creationError, setCreationError] = useState<string>();
  const server = library.server;
  const unavailable = server?.workspace === 'unavailable';

  useEffect(() => {
    window.testron?.command({ type: 'set-shell-route', route: 'dashboard' });
  }, []);

  useEffect(() => {
    if (!submitting || (server?.status !== 'offline' && server?.status !== 'error')) return;
    setSubmitting(false);
    setCreationError(server.message ?? 'The project could not be created.');
  }, [server?.message, server?.status, submitting]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || submitting || unavailable) return;
    setSubmitting(true);
    setCreationError(undefined);
    window.testron?.command({ type: 'create-project', name });
  };

  return (
    <main className="ui-root flex h-screen w-screen flex-col overflow-hidden bg-plane font-sans text-ink antialiased">
      <header className="flex h-14 shrink-0 items-center border-b border-line px-5 [-webkit-app-region:drag]">
        <div className="w-[66px] shrink-0" />
        <div className="flex items-center gap-2.5">
          <span className="ui-mono grid h-7 w-7 place-items-center rounded-[7px] bg-accent text-md font-bold text-accent-ink">
            T
          </span>
          <span className="text-md font-semibold tracking-[-0.01em]">
            {viewerLabel(library.viewer)}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-ink-3 [-webkit-app-region:no-drag]">
          <PulseDot label="Connected to server" />
          Remote workspace
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            size="sm"
            label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            onClick={toggle}
          />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 place-items-center overflow-auto px-8 py-12">
        <section className="w-full max-w-[520px] rounded-xl border border-line bg-surface p-8 shadow-[0_22px_60px_rgba(0,0,0,0.18)]">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-wash text-accent">
            <Icon name={unavailable ? 'alert' : 'grid'} size={20} />
          </div>
          <span className="ui-mono mt-7 block text-xs tracking-[0.12em] text-accent uppercase">
            First project
          </span>
          <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-[-0.03em]">
            {unavailable ? "We couldn't load your projects" : 'Create a project to get started'}
          </h1>
          <p className="mt-3 text-md leading-6 text-ink-2">
            {unavailable
              ? 'Reconnect to the server before creating a project. Your account and any existing projects remain safely on the server.'
              : 'Projects keep environments, tests, and revision history together. You can add more projects from the selector at any time.'}
          </p>

          {unavailable ? (
            <div className="mt-6">
              {server?.message && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-md border border-critical/30 bg-critical-wash px-3 py-2.5 text-sm leading-5 text-ink-2"
                >
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-critical" />
                  {server.message}
                </div>
              )}
              <Button
                variant="primary"
                size="lg"
                icon="rerun"
                disabled={server?.status === 'syncing'}
                onClick={() => window.testron?.command({ type: 'sync-now' })}
              >
                {server?.status === 'syncing' ? 'Reconnecting…' : 'Try again'}
              </Button>
            </div>
          ) : (
            <form className="mt-7" onSubmit={submit}>
              <label className="block">
                <span className="text-sm font-medium text-ink-2">Project name</span>
                <input
                  autoFocus
                  required
                  maxLength={100}
                  aria-label="Project name"
                  value={name}
                  disabled={submitting}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="My website"
                  className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-md text-ink outline-none placeholder:text-ink-3 focus:border-accent"
                />
              </label>
              {creationError && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-md border border-critical/30 bg-critical-wash px-3 py-2.5 text-sm leading-5 text-ink-2"
                >
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-critical" />
                  {creationError}
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                icon="plus"
                className="mt-5"
                disabled={!name.trim() || submitting}
              >
                {submitting ? 'Creating project…' : 'Create project'}
              </Button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
};
