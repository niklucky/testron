import { browserStorageStateSchema } from '@testron/protocol';

import type { BrowserStorageState } from '../replay/runner';

export const parseBrowserStorageState = (
  value: string | undefined,
): BrowserStorageState | undefined => {
  if (!value) return undefined;
  return browserStorageStateSchema.parse(JSON.parse(value)) as BrowserStorageState;
};

export const safeParseBrowserStorageState = (
  value: string | undefined,
): { state?: BrowserStorageState; error?: string } => {
  try {
    return { state: parseBrowserStorageState(value) };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Saved browser storage state is invalid: ${error.message}`
          : 'Saved browser storage state is invalid.',
    };
  }
};
