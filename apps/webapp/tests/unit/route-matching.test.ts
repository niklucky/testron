import { afterEach, describe, expect, it } from 'vitest';

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

describe('webapp route tree', () => {
  it('renders the test detail route as the leaf match', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { pathname: '/' } },
    });
    const [{ createMemoryHistory, createRouter }, { routeTree }] = await Promise.all([
      import('@tanstack/react-router'),
      import('../../src/routeTree.gen'),
    ]);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [
          '/projects/25eb283c-7846-4b32-a72a-57812ec2c28b/tests/4fd5cc97-35b8-49a5-8fad-8dbc9d2f06cc',
        ],
      }),
    });

    await router.load();

    expect(router.state.matches.at(-1)?.routeId).toBe('/projects/$projectId/tests/$testId');
  });
});
