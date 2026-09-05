import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { parkPage } from '../../src/main/recording/park-page';

const browser = () =>
  Object.assign(new EventEmitter(), {
    isLoadingMainFrame: () => true,
    getURL: vi.fn(() => 'https://example.test/'),
    loadURL: vi.fn(() => new Promise<void>(() => {})),
  });

describe('parking the tested page', () => {
  it('waits for the blank document to finish loading even if Electron never resolves loadURL', async () => {
    const contents = browser();
    const parked = parkPage(contents as unknown as WebContents);
    const completed = vi.fn();
    void parked.then(completed);
    contents.emit('did-finish-load');
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    contents.getURL.mockReturnValue('about:blank');
    contents.emit('did-finish-load');
    await parked;
    expect(contents.loadURL).toHaveBeenCalledWith('about:blank');
    expect(contents.listenerCount('did-finish-load')).toBe(0);
    expect(contents.listenerCount('destroyed')).toBe(0);
  });

  it('waits if a cancelled replay has already committed blank but is still loading', async () => {
    const contents = browser();
    contents.getURL.mockReturnValue('about:blank');
    const parked = parkPage(contents as unknown as WebContents);
    const completed = vi.fn();
    void parked.then(completed);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    contents.emit('did-finish-load');
    await parked;
    expect(completed).toHaveBeenCalled();
  });

  it('fails and removes its listeners if the browser closes before loading', async () => {
    const contents = browser();
    const parked = parkPage(contents as unknown as WebContents);
    contents.emit('destroyed');
    await expect(parked).rejects.toThrow('closed during reset');
    expect(contents.listenerCount('did-finish-load')).toBe(0);
  });
});
