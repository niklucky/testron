import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../design';

export interface ProfileVariableInput {
  name: string;
  value: string;
  sensitive: boolean;
}

export interface EditableProfile {
  name: string;
  variables: Array<Omit<ProfileVariableInput, 'value'>>;
}

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
  onSave: (name: string, variables: ProfileVariableInput[]) => void;
}) => {
  const editing = Boolean(profile);
  const [name, setName] = useState(profile?.name ?? 'Administrator');
  const [variables, setVariables] = useState<ProfileVariableInput[]>(
    profile?.variables.map((variable) => ({ ...variable, value: '' })) ?? [
      { name: 'username', value: '', sensitive: false },
      { name: 'password', value: '', sensitive: true },
    ],
  );
  const validVariables = variables.filter((variable) => variable.name.trim());
  const unique =
    new Set(validVariables.map((variable) => variable.name.trim())).size === validVariables.length;
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
        aria-label="Authentication profile"
        className="w-full max-w-[560px] rounded-xl border border-line bg-surface p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold">{editing ? 'Edit profile' : 'New profile'}</h2>
        <p className="mt-1 text-base text-ink-3">
          Credentials for {environment}. Recorded tests store variable names, never these values.
        </p>

        <label className="mt-4 block">
          <span className="text-sm text-ink-3">Profile name</span>
          <input
            aria-label="Profile name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 h-9 w-full rounded-md border border-line bg-plane px-2.5 text-base outline-none focus:border-accent"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-sm text-ink-3">Authentication type</span>
          <select
            aria-label="Authentication type"
            className="mt-1.5 h-9 w-full rounded-md border border-line bg-plane px-2.5 text-base outline-none"
          >
            <option value="credentials">Login / password</option>
            <option disabled>OAuth — coming later</option>
            <option disabled>Authentication header — coming later</option>
            <option disabled>Cookie — coming later</option>
          </select>
        </label>

        <div className="mt-4">
          {editing && (
            <p className="mb-3 text-sm text-ink-3">
              Re-enter variable values to replace the saved credentials.
            </p>
          )}
          <div className="mb-1.5 grid grid-cols-[1fr_1.35fr_70px] gap-2 text-sm text-ink-3">
            <span>Name</span>
            <span>Value</span>
            <span />
          </div>
          {variables.map((variable, index) => (
            <div key={index} className="mb-2 grid grid-cols-[1fr_1.35fr_70px] gap-2">
              <input
                aria-label={`Variable ${index + 1} name`}
                value={variable.name}
                onChange={(event) =>
                  setVariables((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index
                        ? {
                            ...entry,
                            name: event.target.value,
                            sensitive: /password|secret|token/i.test(event.target.value),
                          }
                        : entry,
                    ),
                  )
                }
                className="h-9 rounded-md border border-line bg-plane px-2.5 outline-none focus:border-accent"
              />
              <input
                aria-label={`Variable ${index + 1} value`}
                type={variable.sensitive ? 'password' : 'text'}
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
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setVariables((current) => [...current, { name: '', value: '', sensitive: false }])
            }
          >
            + Variable
          </Button>
          {!unique && <p className="mt-2 text-sm text-critical">Variable names must be unique.</p>}
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
                validVariables.map((variable) => ({ ...variable, name: variable.name.trim() })),
              )
            }
          >
            {editing ? 'Save profile' : 'Create and select'}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
};
