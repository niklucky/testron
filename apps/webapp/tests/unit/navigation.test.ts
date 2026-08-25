import { afterEach, describe, expect, it, vi } from 'vitest';

import { goToRecorder, goToTest } from '../../src/lib/navigation';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../../src/router', () => ({ router: { navigate } }));

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

describe('test navigation', () => {
  it('uses TanStack Router in a browser', async () => {
    const location = { pathname: '/projects/project-1' };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location },
    });

    goToTest('test-1');

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/projects/$projectId/tests/$testId',
        params: { projectId: 'project-1', testId: 'test-1' },
      }),
    );
  });

  it('keeps TestView in the hosted webapp inside Electron', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { pathname: '/projects/project-1' },
        testronDesktop: {},
      },
    });

    goToTest('test-1');

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/projects/$projectId/tests/$testId',
        params: { projectId: 'project-1', testId: 'test-1' },
      }),
    );
  });

  it('passes the selected test explicitly when opening the desktop recorder', () => {
    const openLocal = vi.fn();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { pathname: '/projects/stale-project/tests/stale-test' },
        testronDesktop: { openLocal },
      },
    });

    goToRecorder({ projectId: 'project-1', testId: 'test-1' });

    expect(openLocal).toHaveBeenCalledWith({
      route: 'record',
      projectId: 'project-1',
      testId: 'test-1',
    });
  });
});
