import { useEffect, useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../design';

export const NewTestForm = ({
  suiteName,
  onStart,
  onClose,
}: {
  suiteName?: string;
  onStart: (title: string) => void;
  onClose: () => void;
}) => {
  const [title, setTitle] = useState('');
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
    if (nextTitle) onStart(nextTitle);
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
          Create test
        </h2>
        {suiteName && <p className="mt-1 text-sm text-ink-3">In {suiteName}</p>}

        <form className="mt-6" onSubmit={submit}>
          <label htmlFor={inputId} className="block text-sm font-medium text-ink-2">
            Test title
          </label>
          <input
            id={inputId}
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-line bg-plane px-3 text-md text-ink outline-none placeholder:text-ink-3 focus:border-accent"
          />

          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!title.trim()}>
              Start recording
            </Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
};
