import { useTranslation } from '@warpunit/slang-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../design';

export interface ProfileVariableInput {
  name: string;
  value: string;
  sensitive: boolean;
}

type ProfileAuthenticationType = 'credentials' | 'cookies' | 'headers';

export interface EditableProfile {
  name: string;
  authenticationType: ProfileAuthenticationType;
  variables: Array<Omit<ProfileVariableInput, 'value'>>;
}

const variableOrder = (left: { name: string }, right: { name: string }): number => {
  const priority = (name: string) => {
    const normalized = name.trim().toLowerCase();
    if (normalized === 'username') return 0;
    if (normalized === 'password') return 1;
    return 2;
  };
  return priority(left.name) - priority(right.name) || left.name.localeCompare(right.name);
};

const defaultVariables = (authenticationType: ProfileAuthenticationType): ProfileVariableInput[] =>
  authenticationType === 'credentials'
    ? [
        { name: 'username', value: '', sensitive: false },
        { name: 'password', value: '', sensitive: true },
      ]
    : [{ name: '', value: '', sensitive: true }];

export const ProfileSheet = ({
  environment,
  profile,
  disabled = false,
  onCancel,
  onSave,
}: {
  environment: string;
  profile?: EditableProfile;
  disabled?: boolean;
  onCancel: () => void;
  onSave: (
    name: string,
    authenticationType: ProfileAuthenticationType,
    variables: ProfileVariableInput[],
  ) => void;
}) => {
  const { t } = useTranslation();
  const editing = Boolean(profile);
  const [name, setName] = useState(profile?.name ?? 'Administrator');
  const [authenticationType, setAuthenticationType] = useState<ProfileAuthenticationType>(
    profile?.authenticationType ?? 'credentials',
  );
  const [variables, setVariables] = useState<ProfileVariableInput[]>(
    (
      profile?.variables.map((variable) => ({ ...variable, value: '' })) ??
      defaultVariables('credentials')
    ).sort(variableOrder),
  );
  const validVariables = variables.filter((variable) => variable.name.trim());
  const normalizedVariableName = (variable: ProfileVariableInput) =>
    authenticationType === 'headers' ? variable.name.trim().toLowerCase() : variable.name.trim();
  const unique = new Set(validVariables.map(normalizedVariableName)).size === validVariables.length;
  const complete = validVariables.every((variable) => variable.value.length > 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-center p-5"
      style={{ background: 'var(--ui-overlay)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('authentication_profile')}
        className="w-full max-w-[560px] rounded-xl border border-line bg-surface p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold">{editing ? t('edit_profile') : t('new_profile')}</h2>
        <p className="mt-1 text-ink-3">
          {t('credentials_for')} {environment}
          {t('recorded_tests_store_variable_names_never_these_values')}
        </p>

        <label className="mt-4 block">
          <span className="text-ink-3">{t('profile_name')}</span>
          <input
            aria-label={t('profile_name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 h-9 w-full rounded-md border border-line bg-plane px-2.5 outline-none focus:border-accent"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-ink-3">{t('authentication_type')}</span>
          <select
            aria-label={t('authentication_type')}
            value={authenticationType}
            onChange={(event) => {
              const next = event.target.value as ProfileAuthenticationType;
              setAuthenticationType(next);
              setVariables(defaultVariables(next));
            }}
            className="mt-1.5 h-9 w-full rounded-md border border-line bg-plane px-2.5 outline-none"
          >
            <option value="credentials">{t('login_password')}</option>
            <option disabled>{t('oauth_coming_later')}</option>
            <option value="cookies">{t('cookies')}</option>
            <option value="headers">{t('browser_headers')}</option>
          </select>
        </label>

        <div className="mt-4">
          {editing && (
            <p className="mb-3 text-ink-3">
              {t('re_enter_variable_values_to_replace_the_saved_credentials')}
            </p>
          )}
          <div className="mb-1.5 grid grid-cols-[1fr_1.35fr_70px] gap-2 text-ink-3">
            <span>{t('name')}</span>
            <span>{t('value')}</span>
            <span />
          </div>
          {variables.map((variable, index) => (
            <div key={index} className="mb-2 grid grid-cols-[1fr_1.35fr_70px] gap-2">
              <input
                aria-label={t('variable_name', { value1: index + 1 })}
                value={variable.name}
                onChange={(event) =>
                  setVariables((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index
                        ? {
                            ...entry,
                            name: event.target.value,
                            sensitive:
                              authenticationType !== 'credentials' ||
                              /password|secret|token/i.test(event.target.value),
                          }
                        : entry,
                    ),
                  )
                }
                className="h-9 rounded-md border border-line bg-plane px-2.5 outline-none focus:border-accent"
              />
              <input
                aria-label={t('variable_value', { value1: index + 1 })}
                type={
                  authenticationType !== 'credentials' || variable.sensitive ? 'password' : 'text'
                }
                value={variable.value}
                onChange={(event) =>
                  setVariables((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, value: event.target.value } : entry,
                    ),
                  )
                }
                className="h-9 rounded-md border border-line bg-plane px-2.5 outline-none focus:border-accent"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setVariables((current) => current.filter((_, entryIndex) => entryIndex !== index))
                }
              >
                {t('remove')}
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setVariables((current) => [
                ...current,
                { name: '', value: '', sensitive: authenticationType !== 'credentials' },
              ])
            }
          >
            {authenticationType === 'cookies'
              ? t('add_cookie')
              : authenticationType === 'headers'
                ? t('add_header')
                : t('variable')}
          </Button>
          {!unique && <p className="mt-2 text-critical">{t('variable_names_must_be_unique')}</p>}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button
            variant="primary"
            icon="check"
            disabled={
              disabled || !name.trim() || validVariables.length === 0 || !unique || !complete
            }
            onClick={() =>
              onSave(
                name.trim(),
                authenticationType,
                validVariables.map((variable) => ({ ...variable, name: variable.name.trim() })),
              )
            }
          >
            {editing ? t('save_profile') : t('create_and_select')}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
};
