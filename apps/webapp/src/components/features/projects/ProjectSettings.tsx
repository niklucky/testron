import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

import type { LibrarySnapshot } from '../../../lib/library';
import { Button, Icon, IconButton } from '../../ui/design';
import { ProfileSheet } from '../profiles/ProfileSheet';

type SettingsTab = 'general' | 'environments';

const fieldClass =
  'mt-1.5 h-9 w-full rounded-md border border-line bg-plane px-3 text-ink outline-none placeholder:text-ink-3 focus:border-accent';

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
    <span className="font-medium text-ink-2">{label}</span>
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
  const { t } = useTranslation();
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
  const [newFlowName, setNewFlowName] = useState(() => t('browser_login'));
  const [setupTestId, setSetupTestId] = useState('');
  const [refreshMode, setRefreshMode] = useState<'when-stale' | 'before-every-run'>('when-stale');
  const [maxAgeHours, setMaxAgeHours] = useState(12);
  const [refreshLeadMinutes, setRefreshLeadMinutes] = useState(15);
  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [selectedFlows, setSelectedFlows] = useState<Record<string, string>>({});
  const [selectedBindings, setSelectedBindings] = useState<Record<string, string>>({});
  const [desktopSecretValues, setDesktopSecretValues] = useState<Record<string, string>>({});

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
    (profile) => profile.projectId === project.id,
  );
  const editingProfile = environmentProfiles.find((profile) => profile.id === editingProfileId);
  const browserProfiles = environmentProfiles.filter(
    (profile) =>
      profile.authenticationType === 'browser-session' &&
      Boolean(selectedEnvironment && profile.environmentIds.includes(selectedEnvironment.id)),
  );
  const authenticationFlows = (library.authenticationFlows ?? []).filter(
    (flow) => flow.projectId === project.id,
  );
  const projectSecrets = (library.projectSecrets ?? []).filter(
    (secret) => secret.projectId === project.id,
  );
  const setupTests = library.tests.filter(
    (test) =>
      test.projectId === project.id &&
      Boolean(selectedEnvironment && test.environmentIds.includes(selectedEnvironment.id)),
  );

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
            <p className="font-semibold uppercase tracking-[0.11em] text-ink-3">
              {t('project_settings')}
            </p>
            <h2 id="project-settings-title" className="mt-1 truncate text-md font-semibold">
              {project.name}
            </h2>
          </div>
          <nav className="mt-2 space-y-1" aria-label={t('settings_sections')}>
            {(
              [
                ['general', 'settings', 'General'],
                ['environments', 'suite', 'Environments'],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                className={`flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left transition-colors ${
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
              {tab === 'general' ? t('general') : t('environments')}
            </h3>
            <IconButton
              icon="close"
              label={t('close_settings')}
              className="ml-auto"
              onClick={onClose}
            />
          </header>

          {tab === 'general' ? (
            <form className="min-h-0 flex-1 overflow-y-auto p-6" onSubmit={saveGeneral}>
              <div className="max-w-[600px] space-y-6">
                <Field label={t('project_name')} value={projectName} onChange={setProjectName} />
                <div>
                  <span className="font-medium text-ink-2">{t('icon')}</span>
                  <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-dashed border-line bg-plane p-4">
                    <span className="ui-mono grid h-12 w-12 place-items-center rounded-xl bg-accent font-bold text-accent-ink">
                      {projectName.trim().charAt(0).toUpperCase() || t('p')}
                    </span>
                    <div>
                      <p className="font-medium">{t('project_logo')}</p>
                      <p className="text-ink-3">{t('upload_and_cropping_will_be_added_later')}</p>
                    </div>
                    <Button className="ml-auto" disabled>
                      {t('choose_image')}
                    </Button>
                  </div>
                </div>
                <Field
                  label={t('project_url')}
                  type="url"
                  value={projectUrl}
                  onChange={setProjectUrl}
                  placeholder={t('https_example_com')}
                />
                <div className="flex justify-end border-t border-line-soft pt-5">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!project.revision || !projectName.trim()}
                  >
                    {t('save_changes')}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto border-r border-line p-3">
                <div className="flex items-center px-2 pb-2">
                  <p className="font-semibold uppercase tracking-[0.1em] text-ink-3">
                    {t('environments')}
                  </p>
                  <IconButton
                    icon="plus"
                    size="sm"
                    label={t('add_environment')}
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
                    <span className="truncate font-medium">{environment.name}</span>
                  </button>
                ))}
                {environments.length === 0 && (
                  <p className="px-2 py-4 text-ink-3">{t('no_environments_yet')}</p>
                )}
              </aside>

              {creatingEnvironment ? (
                <form className="min-h-0 overflow-y-auto p-6" onSubmit={createEnvironment}>
                  <div className="max-w-[560px] space-y-5">
                    <div>
                      <h4 className="text-md font-semibold">{t('add_environment')}</h4>
                      <p className="mt-1 text-ink-3">
                        {t('create_another_target_for_this_project')}
                      </p>
                    </div>
                    <Field
                      label={t('environment_name')}
                      value={newEnvironmentName}
                      onChange={setNewEnvironmentName}
                      placeholder={t('staging')}
                    />
                    <Field
                      label={t('url')}
                      type="url"
                      value={newEnvironmentUrl}
                      onChange={setNewEnvironmentUrl}
                      placeholder={t('https_staging_example_com')}
                    />
                    <div className="flex justify-end gap-2 border-t border-line-soft pt-5">
                      <Button
                        onClick={() => {
                          setCreatingEnvironment(false);
                          setCreatingEnvironmentSubmitted(false);
                        }}
                      >
                        {t('cancel')}
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
                        {creatingEnvironmentSubmitted ? t('creating') : t('create_environment')}
                      </Button>
                    </div>
                  </div>
                </form>
              ) : selectedEnvironment ? (
                <form className="min-h-0 overflow-y-auto p-6" onSubmit={saveEnvironment}>
                  <div className="space-y-5">
                    <Field
                      label={t('environment_name')}
                      value={environmentName}
                      onChange={setEnvironmentName}
                    />
                    <Field
                      label={t('url')}
                      type="url"
                      value={environmentUrl}
                      onChange={setEnvironmentUrl}
                    />

                    <section className="border-t border-line pt-5">
                      <div className="flex items-center">
                        <div>
                          <h4 className="text-md font-semibold">{t('profiles')}</h4>
                          <p className="text-ink-3">
                            {t('authentication_variants_for_this_environment')}
                          </p>
                        </div>
                        <IconButton
                          icon="plus"
                          label={t('add_profile')}
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
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {profile.name}
                              </span>
                              <span className="text-ink-3">
                                {profile.environmentIds.includes(selectedEnvironment.id)
                                  ? profile.authenticationType === 'cookies'
                                    ? t('cookies')
                                    : profile.authenticationType === 'headers'
                                      ? t('browser_headers')
                                      : profile.authenticationType === 'storage-state'
                                        ? t('saved_browser_storage_state')
                                        : profile.authenticationType === 'browser-session'
                                          ? t('browser_login')
                                          : t('login_password')
                                  : t('configure')}
                              </span>
                              <IconButton
                                icon="pencil"
                                size="sm"
                                label={t('edit_2', { value1: profile.name })}
                                onClick={() => setEditingProfileId(profile.id)}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="mt-3 w-full rounded-lg border border-dashed border-line p-5 text-ink-3 hover:bg-raised"
                          onClick={() => setEditingProfileId('new')}
                        >
                          {t('add_the_first_profile')}
                        </button>
                      )}
                    </section>

                    {browserProfiles.length > 0 && selectedEnvironment && (
                      <section className="border-t border-line pt-5">
                        <h4 className="text-md font-semibold">{t('browser_authentication')}</h4>
                        <p className="mt-1 text-ink-3">{t('browser_authentication_hint')}</p>

                        <div className="mt-4 rounded-lg border border-line p-4">
                          <h5 className="font-medium">{t('authentication_flows')}</h5>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <input
                              aria-label={t('authentication_flow_name')}
                              value={newFlowName}
                              onChange={(event) => setNewFlowName(event.target.value)}
                              className={fieldClass}
                            />
                            <select
                              aria-label={t('setup_test')}
                              value={setupTestId}
                              onChange={(event) => setSetupTestId(event.target.value)}
                              className={fieldClass}
                            >
                              <option value="">{t('select_login_test')}</option>
                              {setupTests.map((test) => (
                                <option key={test.id} value={test.id}>
                                  {test.title}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label={t('refresh_policy')}
                              value={refreshMode}
                              onChange={(event) =>
                                setRefreshMode(
                                  event.target.value as 'when-stale' | 'before-every-run',
                                )
                              }
                              className={fieldClass}
                            >
                              <option value="when-stale">{t('automatically_when_stale')}</option>
                              <option value="before-every-run">{t('before_every_run')}</option>
                            </select>
                            <label className="text-ink-3">
                              {t('maximum_age_hours')}
                              <input
                                type="number"
                                min={1}
                                max={8760}
                                value={maxAgeHours}
                                onChange={(event) => setMaxAgeHours(Number(event.target.value))}
                                className={fieldClass}
                              />
                            </label>
                            <label className="text-ink-3">
                              {t('refresh_before_expiry_minutes')}
                              <input
                                type="number"
                                min={0}
                                max={10080}
                                value={refreshLeadMinutes}
                                onChange={(event) =>
                                  setRefreshLeadMinutes(Number(event.target.value))
                                }
                                className={fieldClass}
                              />
                            </label>
                            <Button
                              type="button"
                              disabled={
                                !newFlowName.trim() ||
                                !setupTestId ||
                                maxAgeHours <= 0 ||
                                refreshLeadMinutes < 0 ||
                                refreshLeadMinutes >= maxAgeHours * 60
                              }
                              onClick={() => {
                                window.testron?.command({
                                  type: 'create-authentication-flow',
                                  projectId: project.id,
                                  name: newFlowName.trim(),
                                  setupTestId,
                                  refreshMode,
                                  maxAgeSeconds: maxAgeHours * 60 * 60,
                                  refreshBeforeExpirySeconds: refreshLeadMinutes * 60,
                                });
                              }}
                            >
                              {t('create_flow')}
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 rounded-lg border border-line p-4">
                          <h5 className="font-medium">{t('write_only_project_secrets')}</h5>
                          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                            <input
                              aria-label={t('secret_name')}
                              placeholder="E2E_PASSWORD"
                              value={newSecretName}
                              onChange={(event) => setNewSecretName(event.target.value)}
                              className={fieldClass}
                            />
                            <input
                              aria-label={t('secret_value')}
                              type="password"
                              value={newSecretValue}
                              onChange={(event) => setNewSecretValue(event.target.value)}
                              className={fieldClass}
                            />
                            <Button
                              type="button"
                              disabled={!newSecretName.trim() || !newSecretValue}
                              onClick={() => {
                                window.testron?.command({
                                  type: 'create-project-secret',
                                  projectId: project.id,
                                  name: newSecretName.trim(),
                                  value: newSecretValue,
                                });
                                setNewSecretValue('');
                                setNewSecretName('');
                              }}
                            >
                              {t('save_secret')}
                            </Button>
                          </div>
                        </div>

                        {browserProfiles.map((profile) => {
                          const assignment = (library.profileEnvironmentAuthentications ?? []).find(
                            (candidate) =>
                              candidate.profileId === profile.id &&
                              candidate.environmentId === selectedEnvironment.id,
                          );
                          const flowId =
                            selectedFlows[profile.id] ??
                            assignment?.authFlowId ??
                            authenticationFlows[0]?.id ??
                            '';
                          const secretNames = library.authenticationFlowSecretNames?.[flowId] ?? [];
                          const bindings = Object.fromEntries(
                            secretNames.map((name) => [
                              name,
                              {
                                secretId:
                                  selectedBindings[`${profile.id}:${name}`] ??
                                  assignment?.secretBindings[name]?.secretId ??
                                  '',
                              },
                            ]),
                          );
                          const state = (library.authenticationStates ?? []).find(
                            (candidate) =>
                              candidate.owner === 'server' &&
                              candidate.profileId === profile.id &&
                              candidate.environmentId === selectedEnvironment.id,
                          );
                          const desktopState = (library.authenticationStates ?? []).find(
                            (candidate) =>
                              candidate.owner === 'desktop' &&
                              candidate.profileId === profile.id &&
                              candidate.environmentId === selectedEnvironment.id,
                          );
                          return (
                            <div
                              key={profile.id}
                              className="mt-3 rounded-lg border border-line p-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <h5 className="font-medium">{profile.name}</h5>
                                <span className="text-right text-ink-3">
                                  {t('authentication_state_summary', {
                                    value1: desktopState?.status ?? t('not_created'),
                                    value2: state?.status ?? t('not_created'),
                                  })}
                                </span>
                              </div>
                              <select
                                aria-label={t('authentication_flow_for', {
                                  value1: profile.name,
                                })}
                                value={flowId}
                                onChange={(event) =>
                                  setSelectedFlows((current) => ({
                                    ...current,
                                    [profile.id]: event.target.value,
                                  }))
                                }
                                className={fieldClass}
                              >
                                <option value="">{t('select_authentication_flow')}</option>
                                {authenticationFlows.map((flow) => (
                                  <option key={flow.id} value={flow.id}>
                                    {flow.name}
                                  </option>
                                ))}
                              </select>
                              {secretNames.map((name) => (
                                <label key={name} className="mt-3 block">
                                  <span className="text-ink-3">{name}</span>
                                  <select
                                    aria-label={t('secret_binding', { value1: name })}
                                    value={bindings[name]?.secretId ?? ''}
                                    onChange={(event) =>
                                      setSelectedBindings((current) => ({
                                        ...current,
                                        [`${profile.id}:${name}`]: event.target.value,
                                      }))
                                    }
                                    className={fieldClass}
                                  >
                                    <option value="">{t('select_project_secret')}</option>
                                    {projectSecrets.map((secret) => (
                                      <option key={secret.id} value={secret.id}>
                                        {secret.name}
                                      </option>
                                    ))}
                                  </select>
                                  {window.testronDesktop && (
                                    <input
                                      aria-label={t('desktop_value', { value1: name })}
                                      type="password"
                                      placeholder={t('desktop_secret_refresh_hint')}
                                      value={desktopSecretValues[`${profile.id}:${name}`] ?? ''}
                                      onChange={(event) =>
                                        setDesktopSecretValues((current) => ({
                                          ...current,
                                          [`${profile.id}:${name}`]: event.target.value,
                                        }))
                                      }
                                      className={fieldClass}
                                    />
                                  )}
                                </label>
                              ))}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="primary"
                                  disabled={
                                    !flowId ||
                                    Object.values(bindings).some((binding) => !binding.secretId)
                                  }
                                  onClick={() =>
                                    window.testron?.command({
                                      type: 'configure-profile-authentication',
                                      profileId: profile.id,
                                      environmentId: selectedEnvironment.id,
                                      authFlowId: flowId,
                                      secretBindings: bindings,
                                    })
                                  }
                                >
                                  {t('save_authentication')}
                                </Button>
                                {window.testronDesktop && (
                                  <Button
                                    type="button"
                                    disabled={secretNames.some(
                                      (name) => !desktopSecretValues[`${profile.id}:${name}`],
                                    )}
                                    onClick={() => {
                                      window.testron?.command({
                                        type: 'refresh-desktop-authentication',
                                        profileId: profile.id,
                                        environmentId: selectedEnvironment.id,
                                        secretValues: Object.fromEntries(
                                          secretNames.map((name) => [
                                            name,
                                            desktopSecretValues[`${profile.id}:${name}`],
                                          ]),
                                        ),
                                      });
                                      setDesktopSecretValues((current) =>
                                        Object.fromEntries(
                                          Object.entries(current).filter(
                                            ([key]) => !key.startsWith(`${profile.id}:`),
                                          ),
                                        ),
                                      );
                                    }}
                                  >
                                    {t('refresh_desktop_session')}
                                  </Button>
                                )}
                                {window.testronDesktop && (
                                  <Button
                                    type="button"
                                    onClick={() =>
                                      window.testron?.command({
                                        type: 'clear-desktop-authentication',
                                        profileId: profile.id,
                                        environmentId: selectedEnvironment.id,
                                      })
                                    }
                                  >
                                    {t('clear_desktop_session')}
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  onClick={() =>
                                    window.testron?.command({
                                      type: 'manage-server-authentication-state',
                                      projectId: project.id,
                                      environmentId: selectedEnvironment.id,
                                      profileId: profile.id,
                                      action: 'invalidate',
                                    })
                                  }
                                >
                                  {t('refresh_server_session')}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() =>
                                    window.testron?.command({
                                      type: 'manage-server-authentication-state',
                                      projectId: project.id,
                                      environmentId: selectedEnvironment.id,
                                      profileId: profile.id,
                                      action: 'clear',
                                    })
                                  }
                                >
                                  {t('clear_server_session')}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </section>
                    )}

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
                        {t('save_environment')}
                      </Button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="grid place-items-center text-ink-3">
                  {t('select_an_environment')}
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
                  authenticationType: editingProfile.authenticationType,
                  variables: library.profileVariables
                    .filter(
                      (variable) =>
                        variable.profileId === editingProfile.id &&
                        (variable.environmentId === selectedEnvironment.id ||
                          !editingProfile.environmentIds.includes(selectedEnvironment.id)),
                    )
                    .filter(
                      (variable, index, variables) =>
                        variables.findIndex((candidate) => candidate.name === variable.name) ===
                        index,
                    )
                    .map(({ name, sensitive }) => ({ name, sensitive })),
                }
              : undefined
          }
          disabled={editingProfileId !== 'new' && !editingProfile?.revision}
          onCancel={() => setEditingProfileId(undefined)}
          onSave={(name, authenticationType, variables) => {
            if (editingProfileId === 'new')
              window.testron?.command({
                type: 'create-profile',
                environmentId: selectedEnvironment.id,
                name,
                authenticationType,
                variables,
              });
            else if (editingProfile?.revision)
              window.testron?.command({
                type: 'update-profile',
                profileId: editingProfile.id,
                environmentId: selectedEnvironment.id,
                baseRevision: editingProfile.revision,
                name,
                authenticationType,
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
