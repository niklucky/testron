import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import type { LibrarySnapshot } from '../../../lib/library';
import { Button, Icon } from '../../ui/design';
import { passwordChangeError } from './validation';

const fieldClass =
  'mt-1.5 h-10 w-full rounded-md border border-line bg-plane px-3 text-ink outline-none placeholder:text-ink-3 focus:border-accent';

export const ProfileModal = ({
  library,
  onClose,
}: {
  library: LibrarySnapshot;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const [name, setName] = useState(library.viewer?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string>();
  const [submittedAction, setSubmittedAction] = useState<'profile' | 'password'>();
  const action = library.accountAction;
  const visibleAction = action?.type === submittedAction ? action : undefined;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && visibleAction?.status !== 'pending') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, visibleAction?.status]);

  useEffect(() => {
    if (visibleAction?.type !== 'password' || visibleAction.status !== 'success') return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
  }, [visibleAction]);

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setLocalError(undefined);
    setSubmittedAction('profile');
    window.testron?.command({ type: 'update-account-profile', name });
  };

  const savePassword = (event: FormEvent) => {
    event.preventDefault();
    const validationError = passwordChangeError(currentPassword, newPassword, confirmation);
    if (validationError) return setLocalError(validationError);
    setLocalError(undefined);
    setSubmittedAction('password');
    window.testron?.command({
      type: 'change-account-password',
      currentPassword,
      newPassword,
    });
  };

  const message = localError ?? visibleAction?.message;
  const error = Boolean(localError || visibleAction?.status === 'error');
  const pending = visibleAction?.status === 'pending';

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5 [-webkit-app-region:no-drag]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100vh-40px)] w-full max-w-[560px] overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-[0_28px_90px_rgba(0,0,0,0.38)]"
      >
        <div className="flex items-start gap-3">
          <div>
            <p className="font-semibold uppercase tracking-[0.11em] text-accent">{t('account')}</p>
            <h2 id={titleId} className="mt-1 text-2xl font-semibold">
              {t('profile')}
            </h2>
            <p className="mt-1 text-ink-3">{library.viewer?.email}</p>
          </div>
          <Button className="ml-auto" disabled={pending} onClick={onClose}>
            {t('close')}
          </Button>
        </div>

        {message && (
          <div
            role={error ? 'alert' : 'status'}
            className={`mt-5 flex items-start gap-2 rounded-md border px-3 py-2.5 ${
              error
                ? 'border-critical/30 bg-critical-wash text-critical'
                : 'border-good/30 bg-good-wash text-ink-2'
            }`}
          >
            <Icon name={error ? 'alert' : 'check'} size={14} className="mt-0.5 shrink-0" />
            {message}
          </div>
        )}

        <form className="mt-6" onSubmit={saveName}>
          <h3 className="text-md font-semibold">{t('personal_information')}</h3>
          <label className="mt-4 block">
            <span className="font-medium text-ink-2">{t('name')}</span>
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
            />
          </label>
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={pending || !name.trim() || name.trim() === library.viewer?.name}
            >
              {visibleAction?.type === 'profile' && pending ? t('saving') : t('save_name')}
            </Button>
          </div>
        </form>

        <form className="mt-6 border-t border-line pt-6" onSubmit={savePassword}>
          <h3 className="text-md font-semibold">{t('change_password')}</h3>
          <p className="mt-1 text-ink-3">
            {t('existing_signed_in_sessions_remain_active_after_this_change')}
          </p>
          <div className="mt-4 space-y-4">
            {[
              ['Current password', currentPassword, setCurrentPassword],
              ['New password', newPassword, setNewPassword],
              ['Confirm new password', confirmation, setConfirmation],
            ].map(([label, value, setter]) => (
              <label key={label as string} className="block">
                <span className="font-medium text-ink-2">{label as string}</span>
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={200}
                  autoComplete={label === 'Current password' ? 'current-password' : 'new-password'}
                  value={value as string}
                  disabled={pending}
                  onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={
                pending ||
                currentPassword.length < 12 ||
                newPassword.length < 12 ||
                confirmation.length < 12
              }
            >
              {visibleAction?.type === 'password' && pending ? t('updating') : t('update_password')}
            </Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
};
