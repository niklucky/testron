import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useRef, useState, type RefObject } from 'react';

import type { LibrarySnapshot } from '../../../lib/library';
import {
  Avatar,
  Button,
  Icon,
  IconButton,
  NavItem,
  SectionLabel,
  Tooltip,
  useTheme,
  type ThemePreference,
} from '../../ui/design';
import { SuiteTree } from './SuiteTree';
import { ms } from './format';
import { TriageQueue } from './TriageQueue';
import type { Failure, Scope, SuiteRecord, TestRecord, View } from './types';

/**
 * The rail carries two halves of the same job: the project's *structure* on
 * top (suites you can expand, extend and reorder) and the day's *work*
 * underneath (the triage queue). Structure gets the larger share because it is
 * what people navigate by; the queue is what they work through.
 */
export const Sidebar = ({
  view,
  onView,
  suites,
  expandedSuiteIds,
  onToggleSuite,
  openFailures,
  queue,
  scope,
  onScope,
  query,
  onQuery,
  filterOpen,
  onFilterOpen,
  filterRef,
  selectedFailure,
  compact,
  quarantined,
  onSelectFailure,
  onOpenTest,
  onNewTest,
  onReorder,
  onNewSuite,
  onEditSuite,
  onDeleteSuite,
  onSettings,
  onProfile,
  onLog,
  viewer,
  canSignOut,
}: {
  view: View;
  onView: (view: View) => void;
  suites: SuiteRecord[];
  expandedSuiteIds: string[];
  onToggleSuite: (suiteId: string) => void;
  openFailures: number;
  queue: Failure[];
  scope: Scope;
  onScope: (scope: Scope) => void;
  query: string;
  onQuery: (query: string) => void;
  filterOpen: boolean;
  onFilterOpen: (open: boolean) => void;
  filterRef: RefObject<HTMLInputElement | null>;
  selectedFailure: Failure;
  compact: boolean;
  quarantined: string[];
  onSelectFailure: (index: number) => void;
  onOpenTest: (test: TestRecord) => void;
  onNewTest: (suite?: SuiteRecord) => void;
  onReorder: (suiteId: string, from: number, to: number) => void;
  onNewSuite: () => void;
  onEditSuite: (suite: SuiteRecord) => void;
  onDeleteSuite: (suite: SuiteRecord) => void;
  onSettings: () => void;
  onProfile: () => void;
  onLog: (message: string) => void;
  viewer?: LibrarySnapshot['viewer'];
  canSignOut: boolean;
}) => {
  const { locale, setLocale, t } = useTranslation();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { preference, setTheme } = useTheme();
  const label = viewer?.name ?? viewer?.email ?? 'Local workspace';
  const detail = viewer?.email ?? 'Local workspace';
  const initials =
    label
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'LW';

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

  const chooseTheme = (theme: ThemePreference) => {
    setTheme(theme);
    setAccountMenuOpen(false);
  };

  return (
    <aside className="flex min-h-0 flex-col border-r border-line">
      <nav className="shrink-0 space-y-0.5 p-2" aria-label={t('project')}>
        <NavItem
          icon="grid"
          label={t('overview')}
          active={view === 'overview'}
          onClick={() => onView('overview')}
        />
        <NavItem
          icon="triage"
          label={t('triage')}
          active={view === 'triage'}
          badge={openFailures}
          onClick={() => onView('triage')}
        />
        <NavItem
          icon="history"
          label={t('run_history')}
          active={view === 'runs'}
          onClick={() => onView('runs')}
        />
        <NavItem
          icon="members"
          label={t('members')}
          active={view === 'members'}
          onClick={() => onView('members')}
        />
        <Button variant="ghost" size="lg" block icon="record" onClick={() => onNewTest()}>
          {t('new_test')}
        </Button>
        <Button variant="ghost" size="lg" block icon="suite" onClick={onNewSuite}>
          {t('new_test_suite')}
        </Button>
      </nav>

      <section className="flex min-h-0 flex-[1.25] flex-col border-t border-line">
        <div className="flex h-9 shrink-0 items-center gap-2 px-3">
          <SectionLabel>{t('test_suites')}</SectionLabel>
          <span className="ui-mono text-ink-3">
            {suites.length} ·{' '}
            {ms(suites.reduce((sum, suite) => sum + (suite.totalLatestDurationMs ?? 0), 0))}
          </span>
          <IconButton
            icon="plus"
            size="sm"
            label={t('add_a_test_suite')}
            className="ml-auto"
            onClick={onNewSuite}
          />
        </div>
        <SuiteTree
          suites={suites}
          expandedSuiteIds={expandedSuiteIds}
          onToggleSuite={onToggleSuite}
          activeTestId={
            view === 'triage'
              ? suites
                  .flatMap((suite) => suite.tests)
                  .find((test) => test.failureId === selectedFailure.id)?.id
              : undefined
          }
          onOpenTest={onOpenTest}
          onNewTest={onNewTest}
          onReorder={onReorder}
          onEditSuite={onEditSuite}
          onDeleteSuite={onDeleteSuite}
          onLog={onLog}
        />
      </section>

      <TriageQueue
        queue={queue}
        scope={scope}
        onScope={onScope}
        query={query}
        onQuery={onQuery}
        filterOpen={filterOpen}
        onFilterOpen={onFilterOpen}
        filterRef={filterRef}
        selectedId={selectedFailure.id}
        active={view === 'triage'}
        compact={compact}
        quarantined={quarantined}
        onSelect={onSelectFailure}
      />

      <div className="shrink-0 border-t border-line p-2">
        <Button variant="ghost" size="lg" block icon="settings" onClick={onSettings}>
          {t('settings')}
        </Button>
        <div className="relative" ref={accountMenuRef}>
          {accountMenuOpen && (
            <div
              role="menu"
              aria-label={t('account_menu')}
              className="absolute right-0 bottom-[calc(100%+6px)] left-0 z-30 rounded-lg border border-line bg-raised p-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.28)]"
            >
              <button
                type="button"
                role="menuitem"
                disabled={!viewer}
                className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-ink-2 hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => {
                  setAccountMenuOpen(false);
                  onProfile();
                }}
              >
                <Icon name="settings" size={15} />
                {t('profile')}
              </button>
              <div className="my-1 h-px bg-line" />
              <div className="px-2.5 pt-1 pb-1.5 font-medium text-ink-3">{t('change_theme')}</div>
              <div
                role="radiogroup"
                aria-label={t('theme')}
                className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-plane p-1"
              >
                {(
                  [
                    { value: 'light', icon: 'sun' },
                    { value: 'dark', icon: 'moon' },
                    { value: 'system', icon: 'monitor' },
                  ] as const
                ).map(({ value, icon }) => (
                  <Tooltip key={value} content={t(value)} className="block">
                    <button
                      type="button"
                      role="radio"
                      aria-label={t(value)}
                      aria-checked={preference === value}
                      className={`grid h-9 w-full place-items-center rounded-md transition-colors ${
                        preference === value
                          ? 'bg-raised text-ink shadow-sm'
                          : 'text-ink-3 hover:bg-surface hover:text-ink-2'
                      }`}
                      onClick={() => chooseTheme(value)}
                    >
                      <Icon name={icon} size={16} />
                    </button>
                  </Tooltip>
                ))}
              </div>
              <div className="my-1 h-px bg-line" />
              <div className="px-2.5 pt-1 pb-1.5 font-medium text-ink-3">{t('language')}</div>
              <div
                role="radiogroup"
                aria-label={t('language')}
                className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-plane p-1"
              >
                {(
                  [
                    { value: 'en', flag: '🇬🇧', name: 'english' },
                    { value: 'ru', flag: '🇷🇺', name: 'russian' },
                  ] as const
                ).map(({ value, flag, name }) => (
                  <Tooltip key={value} content={t(name)} className="block">
                    <button
                      type="button"
                      role="radio"
                      aria-label={t(name)}
                      aria-checked={locale === value}
                      className={`grid h-9 w-full place-items-center rounded-md leading-none transition-colors ${
                        locale === value
                          ? 'bg-raised text-ink shadow-sm'
                          : 'text-ink-3 hover:bg-surface hover:text-ink-2'
                      }`}
                      onClick={() => setLocale(value)}
                    >
                      <span aria-hidden="true">{flag}</span>
                    </button>
                  </Tooltip>
                ))}
              </div>
              <div className="my-1 h-px bg-line" />
              <button
                type="button"
                role="menuitem"
                disabled={!canSignOut}
                className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-ink-2 hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => {
                  window.testron?.command({ type: 'logout-server' });
                  window.location.hash = '#/';
                  setAccountMenuOpen(false);
                }}
              >
                <Icon name="arrowLeft" size={15} />
                {t('sign_out')}
              </button>
            </div>
          )}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            className="mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-raised"
            onClick={() => setAccountMenuOpen((open) => !open)}
          >
            <Avatar initials={initials} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{label}</span>
              <span className="block truncate text-ink-3">{detail}</span>
            </span>
            <Icon name="dots" size={15} className="shrink-0 text-ink-3" />
          </button>
        </div>
      </div>
    </aside>
  );
};
