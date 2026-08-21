import { useTranslation } from '@warpunit/slang-react';
import { Button, Icon, SectionLabel, type IconName } from '../../ui/design';
import { ms } from '../dashboard/format';
import type { Artifact, ConsoleLine, RunReport } from './types';

const artifactIcon: Record<Artifact['kind'], IconName> = {
  trace: 'history',
  screenshot: 'camera',
  console: 'terminal',
  video: 'play',
  network: 'grid',
};

const levelColor = {
  log: 'var(--ui-ink-3)',
  warn: 'var(--ui-warning-ink)',
  error: 'var(--ui-critical)',
};

/**
 * What the runner kept.
 *
 * Artifacts that exist are openable; the ones the runner does not record yet
 * are listed anyway, greyed, with the reason. A report that quietly omitted
 * them would leave you wondering whether the video failed to save or was never
 * taken — and the list is also the honest backlog for the runner.
 */
const Artifacts = ({
  artifacts,
  onOpen,
}: {
  artifacts: Artifact[];
  onOpen: (name: string) => void;
}) => {
  const { t } = useTranslation();
  return (
    <ul className="space-y-0.5">
      {artifacts.map((artifact) => (
        <li key={artifact.id}>
          <button
            type="button"
            disabled={!artifact.captured}
            title={artifact.hint}
            onClick={() => onOpen(artifact.name)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
              artifact.captured ? 'hover:bg-raised' : 'opacity-50'
            }`}
          >
            <Icon name={artifactIcon[artifact.kind]} size={13} className="shrink-0 text-ink-3" />
            <span className="ui-mono min-w-0 flex-1 truncate ">{artifact.name}</span>
            <span className="ui-mono shrink-0 text-ink-3">
              {artifact.captured ? artifact.size : t('not_captured')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};

/** The full-page capture the runner takes at the moment a step fails. */
const FailureShot = ({ label }: { label: string }) => {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <svg viewBox="0 0 320 190" className="w-full" role="img" aria-label={t('failure_screenshot')}>
        <rect width="320" height="190" fill="var(--ui-shot-bg)" />
        <rect width="320" height="20" fill="var(--ui-shot-chrome)" />
        <rect x="10" y="6" width="120" height="8" rx="4" fill="var(--ui-shot-slot)" />
        <rect x="16" y="34" width="150" height="10" rx="3" fill="var(--ui-shot-block)" />
        <rect x="16" y="54" width="180" height="7" rx="3" fill="var(--ui-shot-block-2)" />
        <rect x="16" y="72" width="180" height="7" rx="3" fill="var(--ui-shot-block-2)" />
        <rect x="212" y="34" width="92" height="120" rx="6" fill="var(--ui-shot-panel)" />
        <rect x="222" y="46" width="60" height="7" rx="3" fill="var(--ui-shot-block)" />
        <rect x="222" y="62" width="72" height="6" rx="3" fill="var(--ui-shot-block-2)" />
        <rect
          x="16"
          y="120"
          width="130"
          height="26"
          rx="6"
          fill="var(--ui-shot-slot)"
          stroke="var(--ui-critical)"
          strokeWidth="2"
        />
        <text x="28" y="137" fill="var(--ui-shot-text)" fontSize="10" fontFamily="monospace">
          {label}
        </text>
        <text x="16" y="168" fill="var(--ui-critical)" fontSize="9" fontFamily="monospace">
          {t('element_is_not_enabled')}
        </text>
      </svg>
    </div>
  );
};

const Console = ({ lines }: { lines: ConsoleLine[] }) => (
  <ul className="ui-mono space-y-1 rounded-lg border border-line bg-plane p-2 leading-4">
    {lines.map((line) => (
      <li key={line.id} className="flex gap-2">
        <span className="shrink-0 text-ink-3">{ms(line.atMs)}</span>
        <span className="min-w-0 break-words" style={{ color: levelColor[line.level] }}>
          {line.text}
        </span>
      </li>
    ))}
  </ul>
);

const Facts = ({ run }: { run: RunReport }) => {
  const { t } = useTranslation();
  return (
    <dl className="space-y-1 ">
      {[
        ['Base URL', run.baseUrl],
        ['Browser', run.browser],
        ['Viewport', run.viewport],
        ['Worker', run.worker],
        ['Timeout', ms(run.timeoutMs)],
        ['Auth state', run.authState],
        ['Secrets', run.secrets.join(', ') || t('none')],
        ['Started', run.startedAt],
      ].map(([term, value]) => (
        <div key={term} className="flex gap-2">
          <dt className="w-[68px] shrink-0 text-ink-3">{term}</dt>
          <dd className="ui-mono min-w-0 flex-1 break-words text-ink-2">{value}</dd>
        </div>
      ))}
    </dl>
  );
};

/** The right rail: everything the run left behind, in the order you reach for it. */
export const Evidence = ({
  run,
  failingLabel,
  onLog,
}: {
  run: RunReport;
  failingLabel?: string;
  onLog: (message: string) => void;
}) => {
  const { t } = useTranslation();
  return (
    <aside className="ui-scroll min-h-0 space-y-4 overflow-y-auto border-l border-line px-3 py-3">
      <section>
        <div className="mb-1.5 flex items-center gap-2">
          <SectionLabel>{t('artifacts')}</SectionLabel>
          <Button
            size="sm"
            variant="ghost"
            icon="copy"
            className="ml-auto"
            onClick={() => onLog(`Artifacts path copied · runs/${run.id}`)}
          >
            {t('path')}
          </Button>
        </div>
        <Artifacts
          artifacts={run.artifacts}
          onOpen={(name) => onLog(`Opened ${name} · ${run.id}`)}
        />
      </section>

      {failingLabel && (
        <section>
          <SectionLabel className="mb-1.5 block">{t('failure_screenshot')}</SectionLabel>
          <FailureShot label={failingLabel} />
          <p className="mt-1.5 text-ink-3">{t('full_page_taken_the_moment_the_step_failed')}</p>
        </section>
      )}

      <section>
        <div className="mb-1.5 flex items-center gap-2">
          <SectionLabel>{t('console')}</SectionLabel>
          <span className="ml-auto text-ink-3">
            {run.console.filter((line) => line.level === 'error').length} {t('errors')}
          </span>
        </div>
        <Console lines={run.console} />
        <p className="mt-1.5 text-ink-3">
          {t('shown_from_the_page_under_test_the_runner_does_not_persist_this_')}
        </p>
      </section>

      <section>
        <SectionLabel className="mb-1.5 block">{t('environment')}</SectionLabel>
        <Facts run={run} />
      </section>
    </aside>
  );
};
