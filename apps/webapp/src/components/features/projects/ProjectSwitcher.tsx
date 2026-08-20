import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import type { LibrarySnapshot } from '../../../lib/library';
import { Button, Icon } from '../../ui/design';

const CREATE_PROJECT = '__create_project__';

export const ProjectSwitcher = ({ library }: { library: LibrarySnapshot }) => {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [projectCountAtSubmit, setProjectCountAtSubmit] = useState<number>();
  const [submitting, setSubmitting] = useState(false);
  const [creationError, setCreationError] = useState<string>();
  const server = library.server;
  const selected =
    library.projects.find((project) => project.id === library.selectedProjectId) ??
    library.projects[0];

  useEffect(() => {
    if (projectCountAtSubmit === undefined || library.projects.length <= projectCountAtSubmit)
      return;
    setCreateOpen(false);
    setProjectCountAtSubmit(undefined);
    setSubmitting(false);
    setCreationError(undefined);
    setName('');
  }, [library.projects.length, projectCountAtSubmit]);

  useEffect(() => {
    if (!submitting || (server?.status !== 'offline' && server?.status !== 'error')) return;
    setSubmitting(false);
    setCreationError(server.message ?? 'The project could not be created.');
  }, [server?.message, server?.status, submitting]);

  const closeCreate = () => {
    setCreateOpen(false);
    setProjectCountAtSubmit(undefined);
    setSubmitting(false);
    setCreationError(undefined);
    setName('');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || submitting) return;
    setProjectCountAtSubmit(library.projects.length);
    setSubmitting(true);
    setCreationError(undefined);
    window.testron?.command({ type: 'create-project', name });
  };

  return (
    <>
      <div className="relative flex items-center gap-2">
        <span className="ui-mono grid h-6 w-6 place-items-center rounded-[6px] bg-accent text-base font-bold text-accent-ink">
          {t('t')}
        </span>
        <div className="relative">
          <select
            aria-label={t('project')}
            value={selected?.id ?? ''}
            onChange={(event) => {
              if (event.target.value === CREATE_PROJECT) {
                setName('');
                setCreationError(undefined);
                setCreateOpen(true);
                return;
              }
              window.testron?.command({
                type: 'select-project',
                projectId: event.target.value,
              });
            }}
            className="h-9 min-w-44 appearance-none rounded-md border border-transparent bg-transparent py-0 pr-8 pl-2 text-md font-medium text-ink outline-none transition-colors hover:border-line hover:bg-raised focus:border-accent"
          >
            {library.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
            <option value={CREATE_PROJECT}>{t('create_project')}</option>
          </select>
          <Icon
            name="caret"
            size={13}
            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-3"
          />
        </div>
      </div>

      {createOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-6 [-webkit-app-region:no-drag]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !submitting) closeCreate();
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-project-title"
              className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-6 shadow-[0_24px_70px_rgba(0,0,0,0.32)]"
            >
              <span className="ui-mono text-xs tracking-[0.12em] text-accent uppercase">
                {t('new_project')}
              </span>
              <h2
                id="create-project-title"
                className="mt-2 text-2xl font-semibold tracking-[-0.02em]"
              >
                {t('create_another_project')}
              </h2>
              <p className="mt-2 text-base leading-5 text-ink-2">
                {t('it_will_be_created_on_your_testron_server_and_selected_here_imme')}
              </p>
              <form className="mt-6" onSubmit={submit}>
                <label className="block">
                  <span className="text-sm font-medium text-ink-2">{t('project_name')}</span>
                  <input
                    autoFocus
                    required
                    maxLength={100}
                    aria-label={t('project_name')}
                    value={name}
                    disabled={submitting}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('marketing_website')}
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
                <div className="mt-6 flex justify-end gap-2">
                  <Button disabled={submitting} onClick={closeCreate}>
                    {t('cancel')}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    icon="plus"
                    disabled={!name.trim() || submitting}
                  >
                    {submitting ? t('creating') : t('create_project_2')}
                  </Button>
                </div>
              </form>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
};
