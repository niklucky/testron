import { useTranslation } from '@warpunit/slang-react';
import { SegmentedControl } from '../../../ui/design';
import type { Failure } from '../types';

const views = [
  { id: 'actual', label: 'Actual' },
  { id: 'expected', label: 'Expected' },
];

/**
 * Screenshot at the moment of failure, against the last green baseline.
 *
 * The image is drawn rather than loaded: the shell has no runner behind it
 * yet, and a themed vector stands in without pretending to be a real capture.
 * Swap the <svg> for an <img> once artifacts are wired up — the surrounding
 * controls do not change.
 */
export const ShotView = ({
  failure,
  view,
  onView,
}: {
  failure: Failure;
  view: 'actual' | 'expected';
  onView: (view: 'actual' | 'expected') => void;
}) => {
  const { t } = useTranslation();
  const failedAt = failure.steps.findIndex((step) => step.state === 'failed');
  const failing = failure.steps[failedAt];
  const isControl = failing?.call === 'locator.click' || failing?.call === 'locator.fill';
  const label = isControl ? failing.target.split(' · ')[0].slice(0, 18) : 'assertion target';
  const overlay = /cookie|intercept/i.test(failure.message);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <SegmentedControl
          label={t('screenshot')}
          items={views}
          value={view}
          onChange={(value) => onView(value as 'actual' | 'expected')}
        />
        <p className="ui-mono text-ink-3">
          {t('captured_at_step')} {failedAt + 1} · 1280×800
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <svg
          viewBox="0 0 640 360"
          className="w-full"
          role="img"
          aria-label={t('captured_screenshot')}
        >
          <rect width="640" height="360" fill="var(--ui-shot-bg)" />
          <rect x="0" y="0" width="640" height="34" fill="var(--ui-shot-chrome)" />
          <circle cx="18" cy="17" r="4" fill="var(--ui-shot-block)" />
          <circle cx="32" cy="17" r="4" fill="var(--ui-shot-block)" />
          <circle cx="46" cy="17" r="4" fill="var(--ui-shot-block)" />
          <rect x="68" y="9" width="230" height="16" rx="8" fill="var(--ui-shot-slot)" />
          <rect x="40" y="62" width="230" height="14" rx="4" fill="var(--ui-shot-block)" />
          <rect x="40" y="88" width="150" height="10" rx="4" fill="var(--ui-shot-block-2)" />
          <rect x="40" y="124" width="270" height="86" rx="8" fill="var(--ui-shot-panel)" />
          <rect x="56" y="142" width="150" height="10" rx="4" fill="var(--ui-shot-block)" />
          <rect x="56" y="164" width="200" height="10" rx="4" fill="var(--ui-shot-block-2)" />
          <rect x="56" y="184" width="120" height="10" rx="4" fill="var(--ui-shot-block-2)" />
          <rect x="360" y="62" width="240" height="180" rx="10" fill="var(--ui-shot-panel)" />
          <rect x="378" y="82" width="120" height="12" rx="4" fill="var(--ui-shot-block)" />
          <rect x="378" y="108" width="204" height="9" rx="4" fill="var(--ui-shot-block-2)" />
          <rect x="378" y="126" width="180" height="9" rx="4" fill="var(--ui-shot-block-2)" />
          {view === 'actual' ? (
            <>
              <rect
                x="378"
                y="188"
                width="150"
                height="34"
                rx="8"
                fill="var(--ui-shot-slot)"
                stroke="var(--ui-critical)"
                strokeWidth="2"
              />
              <text x="398" y="210" fill="var(--ui-shot-text)" fontSize="13" fontFamily="monospace">
                {label}
              </text>
              <text x="378" y="252" fill="var(--ui-critical)" fontSize="11" fontFamily="monospace">
                {failure.signature}
              </text>
              {overlay && (
                <>
                  <rect x="0" y="300" width="640" height="60" fill="var(--ui-shot-chrome)" />
                  <text
                    x="24"
                    y="336"
                    fill="var(--ui-shot-text)"
                    fontSize="12"
                    fontFamily="monospace"
                  >
                    {t('we_use_cookies_to_improve_your_experience')}
                  </text>
                </>
              )}
            </>
          ) : (
            <>
              <rect
                x="378"
                y="188"
                width="150"
                height="34"
                rx="8"
                fill="var(--ui-shot-good-fill)"
                stroke="var(--ui-good)"
                strokeWidth="2"
              />
              <text
                x="398"
                y="210"
                fill="var(--ui-shot-good-text)"
                fontSize="13"
                fontFamily="monospace"
              >
                {label}
              </text>
              <text x="378" y="252" fill="var(--ui-good)" fontSize="11" fontFamily="monospace">
                {t('enabled_click_accepted')}
              </text>
            </>
          )}
        </svg>
      </div>

      <p className="mt-2 text-ink-3">
        {view === 'actual'
          ? failure.message.split('\n')[0]
          : t('baseline_from_the_last_green_run_on_the_same_commit')}
      </p>
    </div>
  );
};
