import { useTranslation } from '@warpunit/slang-react';
import type { DesktopBrowserInstallation } from '@testron/protocol';

import { Button, Icon, Meter } from '../../ui/design';

const megabytes = (bytes: number): string => `${Math.ceil(bytes / (1024 * 1024))} MB`;

export const BrowserInstallModal = ({
  installation,
  onInstall,
  onCancel,
  onClose,
}: {
  installation: DesktopBrowserInstallation;
  onInstall: () => void;
  onCancel: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const installing = installation.status === 'installing';
  const progress = installing ? installation.progress : undefined;
  const phase = installing ? installation.phase : undefined;

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center p-8"
      style={{ background: 'var(--ui-overlay)' }}
      onClick={installing ? undefined : onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="browser-install-title"
        className="w-[500px] max-w-full rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 py-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-raised text-accent">
            <Icon name="arrowDown" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="browser-install-title" className="text-lg font-semibold">
              {t('chromium_is_required')}
            </h2>
            <p className="mt-1 text-ink-3">{t('testron_uses_a_private_chromium')}</p>
          </div>
        </div>

        <div className="border-y border-line-soft px-5 py-4">
          {installation.status === 'failed' && (
            <div className="mb-4 rounded-lg border border-line bg-raised p-3">
              <p className="flex items-start gap-2 font-medium text-ink">
                <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                {installation.message}
              </p>
              {installation.detail && (
                <details className="mt-2 text-ink-3">
                  <summary className="cursor-pointer">{t('technical_details')}</summary>
                  <pre className="ui-scroll ui-mono mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs">
                    {installation.detail}
                  </pre>
                </details>
              )}
            </div>
          )}

          {installing && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-ink-2">
                <span>
                  {phase === 'preparing'
                    ? t('preparing_installation')
                    : phase === 'downloading'
                      ? t('downloading_chromium')
                      : phase === 'extracting'
                        ? t('extracting_chromium')
                        : t('verifying_chromium')}
                </span>
                {progress !== undefined && <span className="ui-mono">{progress}%</span>}
              </div>
              <Meter
                value={progress === undefined ? 0.08 : progress / 100}
                label={progress === undefined ? t('installation_in_progress') : `${progress}%`}
              />
              {installation.downloadedBytes !== undefined &&
                installation.totalBytes !== undefined && (
                  <p className="mt-2 text-ink-3">
                    {megabytes(installation.downloadedBytes)} / {megabytes(installation.totalBytes)}
                  </p>
                )}
            </div>
          )}

          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="text-ink-3">{t('download_size')}</dt>
            <dd>{t('up_to_size', { value1: megabytes(installation.estimatedDownloadBytes) })}</dd>
            <dt className="text-ink-3">{t('install_location')}</dt>
            <dd className="ui-mono truncate" title={installation.installPath}>
              {installation.installPath}
            </dd>
          </dl>
          <p className="mt-3 text-ink-3">{t('chromium_is_only_used_by_testron')}</p>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4">
          {installing ? (
            <Button onClick={onCancel}>{t('cancel')}</Button>
          ) : (
            <>
              <Button onClick={onClose}>{t('not_now')}</Button>
              <Button variant="primary" icon="arrowDown" onClick={onInstall}>
                {t('download_and_install')}
              </Button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
};
