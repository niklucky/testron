import { useTranslation } from '@warpunit/slang-react';
import { HeatMap, Icon, Kbd, Meter, Panel, SectionLabel } from '../../ui/design';
import { failures, owners, pulse } from './data';
import { dashboardShortcutGroups, displayShortcutGroup } from './hotkeys';

/**
 * Everything you might want *while* triaging, and nothing you have to click:
 * how big the queue is, which suites are burning, who is holding what. It is
 * the first thing to go in focus mode.
 */
export const ContextRail = ({ failing }: { failing: number }) => {
  const { t } = useTranslation();
  const busiest = Math.max(...owners.map((owner) => owner.open));

  return (
    <section className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-line p-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Open failures', value: String(failures.length), sub: '3 new today' },
          { label: 'Failing tests', value: String(failing), sub: 'across 6 suites' },
          { label: 'Median triage', value: '12m', sub: 'last 7 days' },
          { label: 'Runs today', value: '38', sub: '6 in the last hour' },
        ].map((tile) => (
          <Panel key={tile.label} className="p-2.5">
            <p className="text-sm text-ink-3">{t(tile.label)}</p>
            <p className="mt-1 text-2xl font-semibold leading-none tabular-nums">{tile.value}</p>
            <p className="mt-1.5 text-xs text-ink-3">{t(tile.sub)}</p>
          </Panel>
        ))}
      </div>

      <div>
        <h3 className="mb-2">
          <SectionLabel>{t('suite_pulse_failures_day')}</SectionLabel>
        </h3>
        <HeatMap
          rows={pulse}
          thresholds={[3, 5, 7]}
          legendLabels={['none', '1–2', '3–4', '5–6', '7+']}
          meta="14 days"
          cellLabel={(row, value, index) =>
            `${row.label} · day −${row.values.length - index} · ${
              value === 0 ? t('no_failures') : t('failures_count', { count: value })
            }`
          }
        />
      </div>

      <div>
        <h3 className="mb-2">
          <SectionLabel>{t('queue_by_owner')}</SectionLabel>
        </h3>
        <ul className="space-y-1.5">
          {owners.map((owner) => (
            <li key={owner.name} className="flex items-center gap-2">
              <span className="w-[88px] shrink-0 truncate text-sm text-ink-2">{owner.name}</span>
              <Meter
                className="flex-1"
                value={owner.open / busiest}
                label={t('open_3', { value1: owner.open })}
              />
              <span className="ui-mono w-4 shrink-0 text-right text-sm text-ink-3">
                {owner.open}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Panel className="p-3">
        <h3 className="mb-2 flex items-center gap-1.5">
          <Icon name="keyboard" size={14} className="text-ink-2" />
          <SectionLabel>{t('hands_stay_home')}</SectionLabel>
        </h3>
        <ul className="space-y-1.5 text-sm text-ink-3">
          {dashboardShortcutGroups.map((group) => (
            <li key={group.description} className="flex items-center gap-2">
              <span className="w-[66px] shrink-0">
                <Kbd>{displayShortcutGroup(group)}</Kbd>
              </span>
              <span>{group.description}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
};
