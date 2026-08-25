import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../design';

export const NewTestForm = ({
  suiteName,
  initialTitle = '',
  heading = 'Create test',
  submitLabel = 'Start recording',
  environments,
  initialEnvironmentIds,
  onStart,
  onClose,
}: {
  suiteName?: string;
  initialTitle?: string;
  heading?: string;
  submitLabel?: string;
  environments?: Array<{ id: string; name: string }>;
  initialEnvironmentIds?: string[];
  onStart: (title: string, environmentIds: string[]) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [environmentIds, setEnvironmentIds] = useState(
    initialEnvironmentIds ?? environments?.map(({ id }) => id) ?? [],
  );
  const titleId = useId();
  const inputId = useId();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (nextTitle && (!environments || environmentIds.length > 0))
      onStart(nextTitle, environmentIds);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-6 [-webkit-app-region:no-drag]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-6 shadow-[0_24px_70px_rgba(0,0,0,0.32)]"
      >
        <h2 id={titleId} className="text-2xl font-semibold tracking-[-0.02em]">
          {heading}
        </h2>
        {suiteName && (
          <p className="mt-1 text-ink-3">
            {t('in')} {suiteName}
          </p>
        )}

        <form className="mt-6" onSubmit={submit}>
          <label htmlFor={inputId} className="block font-medium text-ink-2">
            {t('test_title')}
          </label>
          <input
            id={inputId}
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-ink outline-none placeholder:text-ink-3 focus:border-accent"
          />

          {environments && (
            <fieldset className="mt-5">
              <legend className="font-medium text-ink-2">{t('environments')}</legend>
              <div className="mt-2 space-y-2 rounded-md border border-line bg-plane p-3">
                {environments.map((environment) => (
                  <label key={environment.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={environmentIds.includes(environment.id)}
                      onChange={(event) =>
                        setEnvironmentIds((current) =>
                          event.target.checked
                            ? [...current, environment.id]
                            : current.filter((id) => id !== environment.id),
                        )
                      }
                    />
                    <span>{environment.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={onClose}>{t('cancel')}</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!title.trim() || Boolean(environments && environmentIds.length === 0)}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
};
