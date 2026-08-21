import { useTranslation } from '@warpunit/slang-react';
import type { ReactNode } from 'react';

import { basket, session } from './data';
import type { CaptureMode, SpotId } from './types';

/**
 * The page under test.
 *
 * In the packaged app this rectangle contains the isolated tested-site
 * webview. In a regular browser, a stand-in page keeps the layout useful.
 */

export type PageState = {
  email?: string;
  address?: string;
  delivery?: string;
  card?: string;
  save: boolean;
  confirmed: boolean;
};

const Spot = ({
  id,
  active,
  mode,
  tag,
  className = '',
  children,
}: {
  id: SpotId;
  active?: SpotId;
  mode: CaptureMode;
  tag?: string;
  className?: string;
  children: ReactNode;
}) => {
  const on = active === id;
  const colour = mode === 'assert' ? 'var(--ui-good)' : 'var(--ui-accent)';
  return (
    <div
      className={`relative rounded-md ${className}`}
      style={on ? { boxShadow: `0 0 0 2px ${colour}` } : undefined}
    >
      {on && tag && (
        <span
          className="ui-mono absolute -top-1.5 left-0 z-10 max-w-full -translate-y-full truncate rounded px-1.5 py-px "
          style={{ background: colour, color: 'var(--ui-accent-ink)' }}
        >
          {tag}
        </span>
      )}
      {children}
    </div>
  );
};

const Field = ({
  label,
  value,
  placeholder,
}: {
  label: string;
  value?: string;
  placeholder: string;
}) => (
  <label className="block">
    <span className="font-medium uppercase tracking-wider text-shot-text">{label}</span>
    <span className="mt-1 flex h-9 items-center rounded-md border border-shot-line bg-shot-slot px-3 ">
      <span className={value ? 'text-shot-ink' : 'text-shot-text'}>{value ?? placeholder}</span>
      {value && <span className="ml-auto h-4 w-px animate-pulse bg-shot-ink" />}
    </span>
  </label>
);

export const TargetPage = ({
  state,
  active,
  mode,
  tag,
  recording,
}: {
  state: PageState;
  active?: SpotId;
  mode: CaptureMode;
  tag?: string;
  recording: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <div
      className={`ui-scroll h-full overflow-y-auto bg-shot-bg ${recording ? 'cursor-crosshair' : ''}`}
    >
      <header className="flex h-14 items-center gap-6 border-b border-shot-line bg-shot-panel px-8">
        <span className="font-semibold tracking-tight text-shot-ink">{session.site}</span>
        <nav className="flex gap-5 text-shot-text">
          <span>{t('desks')}</span>
          <span>{t('seating')}</span>
          <span>{t('storage')}</span>
        </nav>
        <Spot id="search" active={active} mode={mode} tag={tag} className="ml-auto w-[220px]">
          <div className="flex h-8 items-center rounded-full border border-shot-line bg-shot-slot px-3 text-shot-text">
            {t('search_the_catalogue')}
          </div>
        </Spot>
        <span className="text-shot-ink">{t('basket_2')}</span>
      </header>

      <div className="mx-auto grid max-w-[900px] grid-cols-[minmax(0,1fr)_260px] gap-6 px-8 py-8">
        <main>
          {state.confirmed ? (
            <Spot id="confirmation" active={active} mode={mode} tag={tag}>
              <div className="rounded-xl border border-shot-line bg-shot-panel p-6">
                <p
                  className="font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--ui-shot-good-text)' }}
                >
                  {t('payment_accepted')}
                </p>
                <h1 className="mt-2 text-[22px] font-semibold text-shot-ink">
                  {t('order_confirmed')}
                </h1>
                <p className="mt-2 leading-5 text-shot-text">
                  Order NW-4471 is on its way to 14 Cavendish Row. A receipt is on its way to
                  ada@example.com.
                </p>
              </div>
            </Spot>
          ) : (
            <>
              <h1 className="text-[22px] font-semibold text-shot-ink">{t('checkout')}</h1>
              <p className="mt-1 text-shot-text">{t('guest_no_account_needed')}</p>

              <div className="mt-5 space-y-4 rounded-xl border border-shot-line bg-shot-panel p-5">
                <Spot id="email" active={active} mode={mode} tag={tag}>
                  <Field
                    label={t('email')}
                    value={state.email}
                    placeholder={t('you_example_com')}
                  />
                </Spot>

                <Spot id="address" active={active} mode={mode} tag={tag}>
                  <Field
                    label={t('shipping_address')}
                    value={state.address}
                    placeholder={t('street_and_number')}
                  />
                </Spot>

                <Spot id="shipping" active={active} mode={mode} tag={tag}>
                  <label className="block">
                    <span className="font-medium uppercase tracking-wider text-shot-text">
                      {t('delivery')}
                    </span>
                    <span className="mt-1 flex h-9 items-center rounded-md border border-shot-line bg-shot-slot px-3 text-shot-ink">
                      {state.delivery === 'express'
                        ? t('express_next_day')
                        : t('standard_3_5_days')}
                      <span className="ml-auto text-shot-text">▾</span>
                    </span>
                  </label>
                </Spot>

                <Spot id="save" active={active} mode={mode} tag={tag}>
                  <span className="flex items-center gap-2 text-shot-ink">
                    <span
                      className="grid h-4 w-4 place-items-center rounded-[3px] border "
                      style={
                        state.save
                          ? {
                              background: 'var(--ui-shot-brand)',
                              borderColor: 'var(--ui-shot-brand)',
                              color: 'var(--ui-shot-brand-ink)',
                            }
                          : { borderColor: 'var(--ui-shot-line)' }
                      }
                    >
                      {state.save ? '✓' : ''}
                    </span>
                    {t('save_my_details_for_next_time')}
                  </span>
                </Spot>

                <Spot id="pay" active={active} mode={mode} tag={tag} className="space-y-3 pt-1">
                  <Field
                    label={t('card_number')}
                    value={state.card ? '•••• •••• •••• 4242' : undefined}
                    placeholder="1234 1234 1234 1234"
                  />
                  <span
                    className="flex h-10 items-center justify-center rounded-md font-semibold"
                    style={{
                      background: 'var(--ui-shot-brand)',
                      color: 'var(--ui-shot-brand-ink)',
                    }}
                  >
                    {t('pay_now')}
                  </span>
                </Spot>
              </div>
            </>
          )}
        </main>

        <Spot id="summary" active={active} mode={mode} tag={tag} className="h-fit">
          <aside className="rounded-xl border border-shot-line bg-shot-panel p-4">
            <p className="font-semibold uppercase tracking-wider text-shot-text">
              {t('order_summary')}
            </p>
            <ul className="mt-3 space-y-3">
              {basket.map((item) => (
                <li key={item.name} className="flex gap-2 ">
                  <span className="h-9 w-9 shrink-0 rounded bg-shot-block" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-shot-ink">{item.name}</span>
                    <span className="block truncate text-shot-text">{item.meta}</span>
                  </span>
                  <span className="text-shot-ink">{item.price}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-shot-line pt-3 ">
              <span className="text-shot-text">{t('total')}</span>
              <span className="font-semibold text-shot-ink">
                {state.delivery === 'express' ? '£148.00' : '£142.00'}
              </span>
            </div>
          </aside>
        </Spot>
      </div>
    </div>
  );
};
