import { useState } from 'react';

import { HeatMap } from './charts/HeatMap';
import { Legend } from './charts/Legend';
import { Ribbon } from './charts/Ribbon';
import { Sparkline } from './charts/Sparkline';
import { SplitBar } from './charts/SplitBar';
import { StackedBars } from './charts/StackedBars';
import { Badge, PulseDot, StatusDot } from './components/Badge';
import { Button, IconButton } from './components/Button';
import { SearchField, TextArea } from './components/Fields';
import { Kbd } from './components/Kbd';
import { Avatar, NavItem } from './components/NavItem';
import { EmptyState, Panel, PanelHeader, SectionLabel } from './components/Panel';
import { SegmentedControl, Tabs } from './components/Segmented';
import { Meter, StatCard, Trend } from './components/Stat';
import { Tooltip } from './components/Tooltip';
import { iconNames, Icon } from './icons';
import { useTheme } from './theme';
import { chartFill, toneFill, toneInk, toneWash, type Tone } from './tone';

const tones: Tone[] = ['accent', 'good', 'warning', 'serious', 'critical', 'neutral'];

const surfaces = [
  ['--ui-plane', 'the window'],
  ['--ui-surface', 'panels, canvas'],
  ['--ui-raised', 'hover, chips'],
  ['--ui-line', 'region borders'],
  ['--ui-line-soft', 'inner borders, tracks'],
];

const inks = [
  ['--ui-ink', 'primary'],
  ['--ui-ink-2', 'secondary'],
  ['--ui-ink-3', 'meta, placeholder'],
];

const typeScale = [
  ['text-3xl', '28px', 'stat numerals'],
  ['text-2xl', '22px', 'page heading'],
  ['text-xl', '19px', 'detail heading'],
  ['text-md', '14px', 'nav, panel titles'],
  ['text-base', '13px', 'body'],
  ['text-sm', '12px', 'secondary'],
  ['text-xs', '11px', 'meta'],
  ['text-2xs', '10px', 'micro-labels'],
];

const Row = ({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) => (
  <Panel className="p-4">
    <div className="mb-3">
      <SectionLabel>{title}</SectionLabel>
      {note && <p className="mt-1 text-sm text-ink-3">{note}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </Panel>
);

/**
 * A live inventory of the design system at `#/design`. It is not a document
 * about the system — it *is* the system, rendered, so a token change shows up
 * here before it shows up in the product.
 */
export const Showcase = () => {
  const { theme, toggle } = useTheme();
  const [segment, setSegment] = useState('14');
  const [tab, setTab] = useState('steps');
  const [query, setQuery] = useState('');

  return (
    <main className="ui-root h-screen w-screen overflow-y-auto bg-plane font-sans text-ink antialiased">
      <div className="mx-auto max-w-[1080px] p-6">
        <header className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Testron design system</h1>
            <p className="mt-1 text-base text-ink-3">
              Every primitive the app is built from, in the theme you are looking at.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button icon={theme === 'dark' ? 'sun' : 'moon'} onClick={toggle}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </Button>
            <Button variant="ghost" onClick={() => (window.location.hash = '#/')}>
              Back to the app
            </Button>
          </div>
        </header>

        <div className="grid gap-3">
          <Row title="Surfaces" note="Plane sits behind surface; raised is a state, not a level.">
            {surfaces.map(([token, use]) => (
              <span key={token} className="w-[168px]">
                <span
                  className="block h-12 rounded-lg border border-line"
                  style={{ background: `var(${token})` }}
                />
                <span className="ui-mono mt-1.5 block text-xs">{token}</span>
                <span className="block text-xs text-ink-3">{use}</span>
              </span>
            ))}
          </Row>

          <Row title="Ink">
            {inks.map(([token, use]) => (
              <span key={token} className="w-[168px]">
                <span className="block text-md" style={{ color: `var(${token})` }}>
                  The quick brown fox
                </span>
                <span className="ui-mono mt-1 block text-xs text-ink-3">
                  {token} · {use}
                </span>
              </span>
            ))}
          </Row>

          <Row
            title="Tones"
            note="fill for marks · ink for text · wash for the background under it."
          >
            {tones.map((tone) => (
              <span key={tone} className="w-[152px]">
                <span
                  className="flex h-12 items-center justify-center rounded-lg"
                  style={{ background: toneWash[tone] }}
                >
                  <span className="h-5 w-5 rounded-full" style={{ background: toneFill[tone] }} />
                  <span className="ml-2 text-sm font-semibold" style={{ color: toneInk[tone] }}>
                    {tone}
                  </span>
                </span>
              </span>
            ))}
          </Row>

          <Row title="Type scale" note="13px body; the steps are tight on purpose.">
            <table className="w-full">
              <tbody>
                {typeScale.map(([name, size, use]) => (
                  <tr key={name} className="border-b border-line-soft last:border-0">
                    <td className={`py-1.5 ${name}`}>Failing since 14:02</td>
                    <td className="ui-mono w-24 text-right text-xs text-ink-3">{name}</td>
                    <td className="ui-mono w-16 text-right text-xs text-ink-3">{size}</td>
                    <td className="w-44 pl-4 text-xs text-ink-3">{use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Row>

          <Row title="Buttons" note="At most one primary per screen.">
            <Button variant="primary" icon="play">
              Run all
            </Button>
            <Button icon="search" kbd="⌘K">
              Jump to…
            </Button>
            <Button variant="soft" icon="rerun" kbd="r">
              Re-run
            </Button>
            <Button variant="ghost" icon="settings">
              Settings
            </Button>
            <Button icon="alert" tone="critical" pressed>
              Needs attention
            </Button>
            <Button disabled icon="shield">
              Disabled
            </Button>
            <IconButton icon="density" label="Row density" />
            <IconButton icon="focus" label="Focus mode" active />
          </Row>

          <Row title="Status marks" note="Colour never travels alone — each mark carries a label.">
            {tones.map((tone) => (
              <Badge key={tone} tone={tone} icon="alert">
                {tone}
              </Badge>
            ))}
            <Badge>neutral</Badge>
            <Badge uppercase tone="warning" size="sm">
              flaky
            </Badge>
            {tones.slice(1).map((tone) => (
              <StatusDot key={tone} tone={tone} label={tone} />
            ))}
            <PulseDot label="Runs in flight" />
            <Kbd>⌘K</Kbd>
            <Avatar initials="NS" />
          </Row>

          <Row title="Selection">
            <SegmentedControl
              variant="solid"
              label="Range"
              value={segment}
              onChange={setSegment}
              items={[
                { id: '7', label: '7d' },
                { id: '14', label: '14d' },
                { id: '30', label: '30d' },
              ]}
            />
            <SegmentedControl
              variant="pill"
              label="Scope"
              value={segment}
              onChange={setSegment}
              items={[
                { id: '7', label: 'All' },
                { id: '14', label: 'New' },
                { id: '30', label: 'Flaky' },
              ]}
            />
            <Tabs
              label="Evidence"
              value={tab}
              onChange={setTab}
              items={[
                { id: 'steps', label: 'Steps', icon: 'steps' },
                { id: 'error', label: 'Error', icon: 'terminal' },
                { id: 'shot', label: 'Screenshot', icon: 'camera' },
              ]}
            />
          </Row>

          <Row title="Input">
            <SearchField
              label="Filter suites"
              placeholder="Filter suites…"
              className="w-[220px]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <SearchField
              size="sm"
              mono
              label="Filter failures"
              placeholder="filter failures"
              hint={<Kbd>esc</Kbd>}
              className="w-[220px]"
            />
            <span className="w-[260px]">
              <TextArea
                label="Session notes"
                className="h-16"
                placeholder="Reproduced on a cold cache…"
              />
            </span>
          </Row>

          <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
            <StatCard
              icon="check"
              label="Pass rate"
              value="94.2%"
              delta={<Trend value={2.1} unit="pts" />}
              foot="181 passed · 6 skipped · 11 failed"
            />
            <StatCard
              icon="clock"
              label="Median triage"
              value="12m"
              delta={<Trend value={-8.4} unit="%" goodDown />}
              foot="last 7 days"
            />
            <Panel className="p-4">
              <SectionLabel>Navigation</SectionLabel>
              <div className="mt-2 space-y-0.5">
                <NavItem icon="grid" label="Overview" active />
                <NavItem icon="triage" label="Triage" badge={9} />
              </div>
            </Panel>
          </div>

          <Panel>
            <PanelHeader
              title="Panel"
              subtitle="Header, body, and an action that belongs to this panel only"
              action={
                <Button size="sm" icon="plus">
                  Add
                </Button>
              }
            />
            <EmptyState>No suites match “checkout”.</EmptyState>
          </Panel>

          <Row title="Data viz" note="Every chart ships a legend; every cell has a tooltip.">
            <span className="flex w-[200px] flex-col gap-2">
              <Sparkline values={[2, 1, 4, 3, 6, 5, 9]} label="7-day trend" />
              <SplitBar
                segments={[
                  { id: 'passed', value: 18, color: toneFill.good, label: 'Passed' },
                  { id: 'skipped', value: 2, color: toneFill.neutral, label: 'Skipped' },
                  { id: 'failed', value: 3, color: toneFill.critical, label: 'Failed' },
                ]}
              />
              <Meter value={0.62} label="62% recorded" />
              <Tooltip content="Tooltips are CSS-only">
                <span className="text-sm text-ink-3 underline decoration-dotted">hover me</span>
              </Tooltip>
            </span>

            <span className="w-[280px]">
              <Legend
                className="mb-1"
                items={[
                  { id: 'passed', label: 'Passed', color: chartFill.passed },
                  { id: 'skipped', label: 'Skipped', color: chartFill.skipped },
                  { id: 'failed', label: 'Failed', color: chartFill.failed },
                ]}
              />
              <StackedBars
                compact
                series={[
                  { id: 'failed', label: 'Failed', color: chartFill.failed },
                  { id: 'skipped', label: 'Skipped', color: chartFill.skipped },
                  { id: 'passed', label: 'Passed', color: chartFill.passed },
                ]}
                data={Array.from({ length: 12 }, (_, index) => ({
                  key: `d${index}`,
                  label: `Day ${index + 1}`,
                  values: { passed: 20 + index, skipped: index % 3, failed: (index * 2) % 5 },
                }))}
              />
            </span>

            <span className="w-[260px]">
              <Ribbon
                height={28}
                cells={['passed', 'passed', 'failed', 'passed', 'flaky', 'failed', 'passed'].map(
                  (verdict, index) => ({
                    id: `run-${index}`,
                    color: verdict === 'flaky' ? toneFill.warning : chartFill[verdict as 'passed'],
                    label: `run −${7 - index} · ${verdict}`,
                  }),
                )}
              />
              <span className="mt-3 block">
                <HeatMap
                  rows={[
                    { id: 'a', label: 'Checkout', values: [0, 2, 0, 5, 8, 1, 0] },
                    { id: 'b', label: 'Payments', values: [1, 0, 0, 3, 0, 6, 2] },
                  ]}
                  thresholds={[3, 5, 7]}
                  legendLabels={['none', '1–2', '3–4', '5–6', '7+']}
                  cellLabel={(row, value) => `${row.label} · ${value} failures`}
                />
              </span>
            </span>
          </Row>

          <Row title="Icons" note="One set, 1.6px stroke, 24px grid, always currentColor.">
            {iconNames.map((name) => (
              <span key={name} className="flex w-[84px] flex-col items-center gap-1 text-ink-2">
                <Icon name={name} size={18} />
                <span className="text-2xs text-ink-3">{name}</span>
              </span>
            ))}
          </Row>
        </div>
      </div>
    </main>
  );
};
