import type { WebContents } from 'electron';

/** Wait for the blank document to finish, which disposes the previous page. */
export const parkPage = (contents: WebContents): Promise<void> => {
  if (contents.getURL() === 'about:blank' && !contents.isLoadingMainFrame())
    return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      contents.removeListener('did-finish-load', loaded);
      contents.removeListener('destroyed', destroyed);
      if (error) reject(error);
      else resolve();
    };
    const loaded = () => {
      if (contents.getURL() === 'about:blank') finish();
    };
    const destroyed = () => finish(new Error('The tested browser closed during reset.'));
    const timeout = setTimeout(
      () => finish(new Error('The tested browser could not reset.')),
      5_000,
    );
    contents.on('did-finish-load', loaded);
    contents.once('destroyed', destroyed);
    // Electron can emit did-finish-load yet leave loadURL's promise pending when
    // this replaces a profile reload already in flight. Listen to the event
    // directly so the new preload has also finished before storage is cleared.
    void contents.loadURL('about:blank').then(
      () => finish(),
      (error: Error) => finish(error),
    );
  });
};
