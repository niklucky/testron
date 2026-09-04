/** Creation is already persisted: a browser reset failure must not invite a retry. */
export const resetBrowserAfterTestCreation = async (
  reset: () => Promise<void>,
  warn: (message: string) => void,
): Promise<void> => {
  try {
    await reset();
  } catch (error) {
    console.warn('Test created, but browser session reset failed.', error);
    warn(error instanceof Error ? error.message : 'Browser session reset failed.');
  }
};
