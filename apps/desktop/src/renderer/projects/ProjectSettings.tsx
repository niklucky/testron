import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import type { LibrarySnapshot } from '../../main/persistence/repository';
import { Button, Icon, IconButton } from '../design';
import { ProfileSheet } from '../profiles/ProfileSheet';

type SettingsTab = 'general' | 'environments';

const fieldClass =
  'mt-1.5 h-9 w-full rounded-md border border-line bg-plane px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:border-accent';

const Field = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) => (
  <label className="block">
    <span className="text-sm font-medium text-ink-2">{label}</span>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={fieldClass}
    />
  </label>
);

export const ProjectSettings = ({
  library,
  onClose,
}: {
  library: LibrarySnapshot;
  onClose: () => void;
}) => {
  const project =
    library.projects.find((candidate) => candidate.id === library.selectedProjectId) ??
    library.projects[0];
  const environments = useMemo(
    () => library.environments.filter((environment) => environment.projectId === project?.id),
    [library.environments, project?.id],
  );
  const [tab, setTab] = useState<SettingsTab>('general');
  const [projectName, setProjectName] = useState(project?.name ?? '');
  const [projectUrl, setProjectUrl] = useState(project?.url ?? '');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(
    library.selectedEnvironmentId ?? environments[0]?.id ?? '',
  );
  const selectedEnvironment = environments.find(
    (environment) => environment.id === selectedEnvironmentId,
  );
  const [environmentName, setEnvironmentName] = useState(selectedEnvironment?.name ?? '');
  const [environmentUrl, setEnvironmentUrl] = useState(selectedEnvironment?.baseUrl ?? '');
  const [creatingEnvironment, setCreatingEnvironment] = useState(false);
  const [creatingEnvironmentSubmitted, setCreatingEnvironmentSubmitted] = useState(false);
  const [newEnvironmentName, setNewEnvironmentName] = useState('');
  const [newEnvironmentUrl, setNewEnvironmentUrl] = useState('');
  const creationOriginId = useRef<string | undefined>(undefined);
  const [editingProfileId, setEditingProfileId] = useState<string | 'new'>();

  useEffect(() => {
    setEnvironmentName(selectedEnvironment?.name ?? '');
    setEnvironmentUrl(selectedEnvironment?.baseUrl ?? '');
  }, [selectedEnvironment?.baseUrl, selectedEnvironment?.id, selectedEnvironment?.name]);

  useEffect(() => {
    const createdId = library.selectedEnvironmentId;
    if (
      !creatingEnvironmentSubmitted ||
      !createdId ||
      createdId === creationOriginId.current ||
      !environments.some((environment) => environment.id === createdId)
    )
      return;
    setSelectedEnvironmentId(createdId);
    setCreatingEnvironment(false);
    setCreatingEnvironmentSubmitted(false);
    setNewEnvironmentName('');
    setNewEnvironmentUrl('');
  }, [creatingEnvironmentSubmitted, environments, library.selectedEnvironmentId]);

  useEffect(() => {
    if (
      creatingEnvironmentSubmitted &&
      (library.server?.status === 'error' || library.server?.status === 'offline')
    )
      setCreatingEnvironmentSubmitted(false);
  }, [creatingEnvironmentSubmitted, library.server?.status]);

  if (!project) return null;

  const environmentProfiles = library.profiles.filter(
    (profile) => profile.environmentId === selectedEnvironment?.id,
  );
  const editingProfile = environmentProfiles.find((profile) => profile.id === editingProfileId);

  const saveGeneral = (event: FormEvent) => {
    event.preventDefault();
    if (!project.revision || !projectName.trim()) return;
    window.testron?.command({
      type: 'update-project',
      projectId: project.id,
      baseRevision: project.revision,
      name: projectName,
      url: projectUrl.trim() || null,
    });
  };

  const saveEnvironment = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEnvironment?.revision || !environmentName.trim() || !environmentUrl.trim()) return;
    window.testron?.command({
      type: 'update-environment',
      environmentId: selectedEnvironment.id,
      baseRevision: selectedEnvironment.revision,
      name: environmentName,
      baseUrl: environmentUrl,
    });
  };

  const startEnvironmentCreation = () => {
    creationOriginId.current = library.selectedEnvironmentId;
    setCreatingEnvironment(true);
    setCreatingEnvironmentSubmitted(false);
    setNewEnvironmentName('');
    setNewEnvironmentUrl(project.url ?? '');
  };

  const createEnvironment = (event: FormEvent) => {
    event.preventDefault();
    if (!newEnvironmentName.trim() || !newEnvironmentUrl.trim()) return;
    setCreatingEnvironmentSubmitted(true);
    window.testron?.command({
      type: 'create-environment',
      projectId: project.id,
      name: newEnvironmentName,
      baseUrl: newEnvironmentUrl,
      testIdAttribute: 'data-testid',
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5 [-webkit-app-region:no-drag]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
        className="grid h-[min(720px,calc(100vh-40px))] w-full max-w-[980px] grid-cols-[220px_minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_28px_90px_rgba(0,0,0,0.38)]"
      >
        <aside className="border-r border-line bg-plane/60 p-3">
          <div className="px-2 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.11em] text-ink-3">
              Project settings
            </p>
            <h2 id="project-settings-title" className="mt-1 truncate text-md font-semibold">
              {project.name}
            </h2>
          </div>
          <nav className="mt-2 space-y-1" aria-label="Settings sections">
            {(
              [
                ['general', 'settings', 'General'],
                ['environments', 'suite', 'Environments'],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                className={`flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-base transition-colors ${
                  tab === id ? 'bg-accent-wash font-medium text-ink' : 'text-ink-2 hover:bg-raised'
                }`}
                onClick={() => setTab(id)}
              >
                <Icon name={icon} size={14} className="text-ink-3" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-0 flex-col">
          <header className="flex h-14 shrink-0 items-center border-b border-line px-5">
            <h3 className="text-lg font-semibold">
              {tab === 'general' ? 'General' : 'Environments'}
            </h3>
            <IconButton icon="close" label="Close settings" className="ml-auto" onClick={onClose} />
          </header>

          {tab === 'general' ? (
            <form className="min-h-0 flex-1 overflow-y-auto p-6" onSubmit={saveGeneral}>
              <div className="max-w-[600px] space-y-6">
                <Field label="Project name" value={projectName} onChange={setProjectName} />
                <div>
                  <span className="text-sm font-medium text-ink-2">Icon</span>
                  <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-dashed border-line bg-plane p-4">
                    <span className="ui-mono grid h-12 w-12 place-items-center rounded-xl bg-accent text-xl font-bold text-accent-ink">
                      {projectName.trim().charAt(0).toUpperCase() || 'P'}
                    </span>
                    <div>
                      <p className="text-base font-medium">Project logo</p>
                      <p className="text-sm text-ink-3">Upload and cropping will be added later.</p>
                    </div>
                    <Button className="ml-auto" disabled>
                      Choose image
                    </Button>
                  </div>
                </div>
                <Field
                  label="Project URL"
                  type="url"
                  value={projectUrl}
                  onChange={setProjectUrl}
                  placeholder="https://example.com"
                />
                <div className="flex justify-end border-t border-line-soft pt-5">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!project.revision || !projectName.trim()}
                  >
                    Save changes
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto border-r border-line p-3">
                <div className="flex items-center px-2 pb-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">
                    Environments
                  </p>
                  <IconButton
                    icon="plus"
                    size="sm"
                    label="Add environment"
                    className="ml-auto"
                    onClick={startEnvironmentCreation}
                  />
                </div>
                {environments.map((environment) => (
                  <button
                    key={environment.id}
                    type="button"
                    className={`mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left ${
                      selectedEnvironmentId === environment.id
                        ? 'bg-accent-wash'
                        : 'hover:bg-raised'
                    }`}
                    onClick={() => {
                      setCreatingEnvironment(false);
                      setCreatingEnvironmentSubmitted(false);
                      setSelectedEnvironmentId(environment.id);
                    }}
                  >
                    <span className="h-2 w-2 rounded-full bg-good" />
                    <span className="truncate text-base font-medium">{environment.name}</span>
                  </button>
                ))}
                {environments.length === 0 && (
                  <p className="px-2 py-4 text-sm text-ink-3">No environments yet.</p>
                )}
              </aside>

              {creatingEnvironment ? (
                <form className="min-h-0 overflow-y-auto p-6" onSubmit={createEnvironment}>
                  <div className="max-w-[560px] space-y-5">
                    <div>
                      <h4 className="text-md font-semibold">Add environment</h4>
                      <p className="mt-1 text-sm text-ink-3">
                        Create another target for this project.
                      </p>
                    </div>
                    <Field
                      label="Environment name"
                      value={newEnvironmentName}
                      onChange={setNewEnvironmentName}
                      placeholder="Staging"
                    />
                    <Field
                      label="URL"
                      type="url"
                      value={newEnvironmentUrl}
                      onChange={setNewEnvironmentUrl}
                      placeholder="https://staging.example.com"
                    />
                    <div className="flex justify-end gap-2 border-t border-line-soft pt-5">
                      <Button
                        onClick={() => {
                          setCreatingEnvironment(false);
                          setCreatingEnvironmentSubmitted(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={
                          creatingEnvironmentSubmitted ||
                          !newEnvironmentName.trim() ||
                          !newEnvironmentUrl.trim()
                        }
                      >
                        {creatingEnvironmentSubmitted ? 'Creating…' : 'Create environment'}
                      </Button>
                    </div>
                  </div>
                </form>
              ) : selectedEnvironment ? (
                <form className="min-h-0 overflow-y-auto p-6" onSubmit={saveEnvironment}>
                  <div className="space-y-5">
                    <Field
                      label="Environment name"
                      value={environmentName}
                      onChange={setEnvironmentName}
                    />
                    <Field
                      label="URL"
                      type="url"
                      value={environmentUrl}
                      onChange={setEnvironmentUrl}
                    />

                    <section className="border-t border-line pt-5">
                      <div className="flex items-center">
                        <div>
                          <h4 className="text-md font-semibold">Profiles</h4>
                          <p className="text-sm text-ink-3">
                            Authentication variants for this environment.
                          </p>
                        </div>
                        <IconButton
                          icon="plus"
                          label="Add profile"
                          className="ml-auto"
                          onClick={() => setEditingProfileId('new')}
                        />
                      </div>

                      {environmentProfiles.length > 0 ? (
                        <div className="mt-3 overflow-hidden rounded-lg border border-line">
                          {environmentProfiles.map((profile, index) => (
                            <div
                              key={profile.id}
                              className={`flex h-11 items-center gap-3 px-3 ${
                                index > 0 ? 'border-t border-line-soft' : ''
                              }`}
                            >
                              <Icon name="lock" size={14} className="text-ink-3" />
                              <span className="min-w-0 flex-1 truncate text-base font-medium">
                                {profile.name}
                              </span>
                              <span className="text-sm text-ink-3">Login / password</span>
                              <IconButton
                                icon="pencil"
                                size="sm"
                                label={`Edit ${profile.name}`}
                                onClick={() => setEditingProfileId(profile.id)}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="mt-3 w-full rounded-lg border border-dashed border-line p-5 text-sm text-ink-3 hover:bg-raised"
                          onClick={() => setEditingProfileId('new')}
                        >
                          + Add the first profile
                        </button>
                      )}
                    </section>

                    <div className="flex justify-end border-t border-line-soft pt-5">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={
                          !selectedEnvironment.revision ||
                          !environmentName.trim() ||
                          !environmentUrl.trim()
                        }
                      >
                        Save environment
                      </Button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="grid place-items-center text-base text-ink-3">
                  Select an environment.
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      {editingProfileId && selectedEnvironment && (
        <ProfileSheet
          key={editingProfileId}
          environment={selectedEnvironment.name}
          profile={
            editingProfile
              ? {
                  name: editingProfile.name,
                  variables: library.profileVariables
                    .filter((variable) => variable.profileId === editingProfile.id)
                    .map(({ name, sensitive }) => ({ name, sensitive })),
                }
              : undefined
          }
          disabled={editingProfileId !== 'new' && !editingProfile?.revision}
          onCancel={() => setEditingProfileId(undefined)}
          onSave={(name, variables) => {
            if (editingProfileId === 'new')
              window.testron?.command({
                type: 'create-profile',
                environmentId: selectedEnvironment.id,
                name,
                authenticationType: 'credentials',
                variables,
              });
            else if (editingProfile?.revision)
              window.testron?.command({
                type: 'update-profile',
                profileId: editingProfile.id,
                baseRevision: editingProfile.revision,
                name,
                authenticationType: 'credentials',
                variables,
              });
            setEditingProfileId(undefined);
          }}
        />
      )}
    </div>,
    document.body,
  );
};
