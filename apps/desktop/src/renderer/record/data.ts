import type { RecordedStep } from './types';

/**
 * The screen is a shell: there is no recorder attached to it yet, so the take
 * below stands in for one. Pressing Record plays it back a step at a time,
 * which is enough to judge the layout, the panel rhythm and the code that
 * comes out the other end.
 *
 * Replace `script` with the live `AppSnapshot.steps` stream (preload/api.ts)
 * and nothing above it has to change.
 */

export const session = {
  project: 'Commerce app',
  suite: 'Checkout',
  environment: 'Staging',
  test: 'Guest checkout · card payment',
  file: 'tests/checkout/guest-card.spec.ts',
  baseUrl: 'https://staging.commerce.app/checkout',
  site: 'Northwind Supply',
  testIdAttribute: 'data-test',
};

export const script: RecordedStep[] = [
  {
    id: 's1',
    kind: 'navigate',
    label: session.baseUrl,
    locator: '',
    alternatives: [],
    url: session.baseUrl,
    at: 0,
  },
  {
    id: 's2',
    kind: 'fill',
    label: 'Email',
    locator: "getByLabel('Email')",
    alternatives: ["getByTestId('checkout-email')", "locator('#email')"],
    spot: 'email',
    value: 'ada@example.com',
    at: 6,
  },
  {
    id: 's3',
    kind: 'fill',
    label: 'Shipping address',
    locator: "getByLabel('Shipping address')",
    alternatives: ["getByPlaceholder('Street and number')", "locator('#address')"],
    spot: 'address',
    value: '14 Cavendish Row',
    at: 14,
  },
  {
    id: 's4',
    kind: 'select',
    label: 'Delivery',
    locator: "getByLabel('Delivery')",
    alternatives: ["getByTestId('shipping-method')"],
    spot: 'shipping',
    value: 'express',
    at: 21,
  },
  {
    id: 's5',
    kind: 'assert',
    label: 'Order total',
    locator: "getByTestId('order-total')",
    alternatives: ["getByText('£148.00')"],
    spot: 'summary',
    assertion: 'textEquals',
    value: '£148.00',
    at: 27,
  },
  {
    id: 's6',
    kind: 'check',
    label: 'Save my details',
    locator: "getByRole('checkbox', { name: 'Save my details' })",
    alternatives: ["getByLabel('Save my details')"],
    spot: 'save',
    at: 33,
  },
  {
    id: 's7',
    kind: 'fill',
    label: 'Card number',
    locator: "getByLabel('Card number')",
    alternatives: ["getByTestId('card-number')"],
    spot: 'pay',
    secret: 'TESTRON_CARD_NUMBER',
    warning: 'Masked field — recorded as an environment variable, not a literal.',
    at: 39,
  },
  {
    id: 's8',
    kind: 'click',
    label: 'Pay now',
    locator: "getByRole('button', { name: 'Pay now' })",
    alternatives: ["getByTestId('pay-now')", "locator('form button.primary')"],
    spot: 'pay',
    at: 46,
  },
  {
    id: 's9',
    kind: 'assert',
    label: 'Order confirmed',
    locator: "getByRole('heading', { name: 'Order confirmed' })",
    alternatives: ["getByText('Order confirmed')"],
    spot: 'confirmation',
    assertion: 'visible',
    at: 53,
  },
  {
    id: 's10',
    kind: 'assertUrl',
    label: 'Confirmation URL',
    locator: '',
    alternatives: [],
    value: '/checkout/confirmed',
    at: 55,
  },
];

/** The order summary drawn on the stand-in page. */
export const basket = [
  { name: 'Aeron task chair', meta: 'Graphite · size B', price: '£129.00' },
  { name: 'Cable tray', meta: 'Under-desk, 60cm', price: '£19.00' },
];
