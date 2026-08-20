import { useTranslation } from '@warpunit/slang-react';
import { Badge, Button, Kbd, Tabs, type SegmentedItem } from '../design';
import { ErrorView } from './views/ErrorView';
import { HistoryView } from './views/HistoryView';
import { displayShortcut, triageShortcutIds } from './hotkeys';
import { ManualView } from './views/ManualView';
import { ShotView } from './views/ShotView';
import { StepsView } from './views/StepsView';
import type { EvidenceTab, Failure, ManualVerdict } from './types';

export const evidenceTabs: SegmentedItem<EvidenceTab>[] = [
  { id: 'steps', label: 'Steps', icon: 'steps' },
  { id: 'error', label: 'Error', icon: 'terminal' },
  { id: 'shot', label: 'Screenshot', icon: 'camera' },
  { id: 'manual', label: 'Manual', icon: 'clipboard' },
  { id: 'history', label: 'History', icon: 'history' },
];

export const triageActions = [
  { key: 'r', icon: 'rerun', label: 'Re-run' },
  { key: 'q', icon: 'shield', label: 'Quarantine' },
  { key: 'b', icon: 'bug', label: 'File bug' },
] as const;

/**
 * One failure, five ways of looking at it. The header never changes as you
 * move between tabs — the subject is fixed, only the evidence swaps — and the
 * three actions that resolve a failure stay pinned to the same corner.
 */
export const Triage = ({
  failure,
  tab,
  onTab,
  shotView,
  onShotView,
  manualResults,
  manualCursor,
  onManualCursor,
  onManualVerdict,
  quarantined,
  onAction,
  onSelectFailure,
}: {
  failure: Failure;
  tab: EvidenceTab;
  onTab: (tab: EvidenceTab) => void;
  shotView: 'actual' | 'expected';
  onShotView: (view: 'actual' | 'expected') => void;
  manualResults: Record<string, ManualVerdict>;
  manualCursor: number;
  onManualCursor: (index: number) => void;
  onManualVerdict: (stepId: string, verdict: ManualVerdict) => void;
  quarantined: boolean;
  onAction: (key: 'r' | 'q' | 'b') => void;
  onSelectFailure: (id: string) => void;
}) => {
  const { t } = useTranslation();
  return (
    <section className="flex min-h-0 flex-col bg-surface">
      <div className="shrink-0 border-b border-line-soft px-5 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <Badge tone="critical" icon="alert" className="mt-1">
            {t('failed_2')}
          </Badge>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-[-0.01em]">{failure.test}</h1>
            <p className="ui-mono mt-1 truncate text-base text-ink-3">
              {failure.file} · {failure.runId} · {failure.browser} · {failure.env}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1">
          <Tabs label={t('evidence')} items={evidenceTabs} value={tab} onChange={onTab} />
          <span className="ml-1 flex items-center gap-1">
            <Kbd>{displayShortcut('previousEvidence')}</Kbd>
            <Kbd>{displayShortcut('nextEvidence')}</Kbd>
          </span>

          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {triageActions.map((action) => (
              <Button
                key={action.key}
                variant="soft"
                size="md"
                icon={action.icon}
                kbd={displayShortcut(triageShortcutIds[action.key])}
                tone="warning"
                pressed={action.key === 'q' ? quarantined : undefined}
                aria-label={t(action.label)}
                title={t('press_2', {
                  value1: t(action.label),
                  value2: displayShortcut(triageShortcutIds[action.key]),
                })}
                onClick={() => onAction(action.key)}
              />
            ))}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === 'steps' && <StepsView failure={failure} />}
        {tab === 'error' && <ErrorView failure={failure} onSelect={onSelectFailure} />}
        {tab === 'shot' && <ShotView failure={failure} view={shotView} onView={onShotView} />}
        {tab === 'manual' && (
          <ManualView
            failure={failure}
            results={manualResults}
            cursor={manualCursor}
            onCursor={onManualCursor}
            onVerdict={onManualVerdict}
          />
        )}
        {tab === 'history' && <HistoryView failure={failure} />}
      </div>
    </section>
  );
};
