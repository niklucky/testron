import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../design';

type EditableSuite = {
  id: string;
  name: string;
};

/** The same compact form serves both suite creation and renaming. */
export const TestSuiteForm = ({
  suite,
  onSave,
  onClose,
}: {
  suite?: EditableSuite;
  onSave: (name: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState(suite?.name ?? '');
  const titleId = useId();
  const nameId = useId();
  const editing = Boolean(suite);

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
    const nextName = name.trim();
    if (nextName) onSave(nextName);
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
          {editing ? t('update_test_suite') : t('new_test_suite')}
        </h2>

        <form className="mt-6" onSubmit={submit}>
          <label htmlFor={nameId} className="block text-sm font-medium text-ink-2">
            {t('name')}
          </label>
          <input
            id={nameId}
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-md text-ink outline-none placeholder:text-ink-3 focus:border-accent"
          />

          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              {editing ? t('save_changes') : t('create_test_suite')}
            </Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
};
