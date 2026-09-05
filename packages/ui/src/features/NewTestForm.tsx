import type { ScreenshotUpload } from '@testron/protocol';
import { ScreenshotPicker } from './ScreenshotPicker';
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
  onRequest,
  showDescription = true,
  onClose,
}: {
  suiteName?: string;
  initialTitle?: string;
  heading?: string;
  submitLabel?: string;
  environments?: Array<{ id: string; name: string }>;
  initialEnvironmentIds?: string[];
  onStart?: (
    title: string,
    environmentIds: string[],
    description: string,
    screenshots: ScreenshotUpload[],
  ) => void;
  onRequest?: (
    title: string,
    environmentIds: string[],
    description: string,
    screenshots: ScreenshotUpload[],
  ) => void;
  showDescription?: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [screenshots, setScreenshots] = useState<ScreenshotUpload[]>([]);
  const [readingScreenshots, setReadingScreenshots] = useState(false);
  const [description, setDescription] = useState('');
  const descriptionId = useId();
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
    if (readingScreenshots) return;
    const nextTitle = title.trim();
    if (nextTitle && (!environments || environmentIds.length > 0))
      if (onStart) onStart(nextTitle, environmentIds, description.trim(), screenshots);
      else if (description.trim())
        onRequest?.(nextTitle, environmentIds, description.trim(), screenshots);
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
        className="max-h-[calc(100dvh-3rem)] w-full max-w-[520px] overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-[0_24px_70px_rgba(0,0,0,0.32)]"
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

          {showDescription && (
            <div className="mt-5">
              <label htmlFor={descriptionId} className="block font-medium text-ink-2">
                {t('description_draft')}
              </label>
              <textarea
                id={descriptionId}
                maxLength={20000}
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('test_request_description_hint')}
                className="mt-2 w-full rounded-md border border-line bg-plane px-3 py-2 text-ink outline-none placeholder:text-ink-3 focus:border-accent"
              />
            </div>
          )}

          {onRequest && (
            <div className="mt-5">
              <ScreenshotPicker
                value={screenshots}
                onChange={setScreenshots}
                onBusyChange={setReadingScreenshots}
              />
            </div>
          )}

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

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button onClick={onClose}>{t('cancel')}</Button>
            {onRequest && (
              <Button
                type={onStart ? 'button' : 'submit'}
                variant={onStart ? 'default' : 'primary'}
                disabled={
                  readingScreenshots ||
                  !title.trim() ||
                  !description.trim() ||
                  Boolean(environments && environmentIds.length === 0)
                }
                onClick={
                  onStart
                    ? () => onRequest(title.trim(), environmentIds, description.trim(), screenshots)
                    : undefined
                }
              >
                {t('request_test')}
              </Button>
            )}
            {onStart && (
              <Button
                type="submit"
                variant="primary"
                disabled={
                  readingScreenshots ||
                  !title.trim() ||
                  Boolean(environments && environmentIds.length === 0)
                }
              >
                {submitLabel}
              </Button>
            )}
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
};
