import { afterEach, expect, it, vi } from 'vitest';
import type { WebWorkspaceSnapshot } from '@testron/protocol';
import type { AppSnapshot } from '../../src/lib/library';

const mocks = vi.hoisted(() => ({ save: vi.fn(), fetch: vi.fn() }));
vi.mock('../../src/lib/trpc', () => ({
  trpcClient: { test: { saveRevision: { mutate: mocks.save } } },
  queryClient: { invalidateQueries: async () => undefined, fetchQuery: mocks.fetch },
}));
vi.mock('../../src/lib/workspace', () => ({ workspaceQueryOptions: () => ({}) }));

afterEach(() => vi.unstubAllGlobals());

it('reports rejected step edits, preserves invalid source, and clears the error after a source save', async () => {
  vi.stubGlobal('window', {});
  const { browserApi, connectBrowserApi } = await import('../../src/lib/browser-api');
  const source = "test('unfinished', async ({ page }) => {";
  const workspace = {
    projects: [{ id: 'project' }],
    environments: [],
    profiles: [],
    activeRuns: [],
    tests: [
      {
        test: { id: 'test', projectId: 'project', title: 'Test', currentRevision: 1 },
        currentRevision: { content: { title: 'Test', source, steps: [], environmentIds: [] } },
      },
    ],
  } as unknown as WebWorkspaceSnapshot;
  mocks.fetch.mockResolvedValue(workspace);
  connectBrowserApi(workspace, 'project', 'test');
  let snapshot: AppSnapshot | undefined;
  const unsubscribe = browserApi.onSnapshot((next) => {
    snapshot = next;
  });
  browserApi.command({ type: 'delete-step', index: 0 });
  await vi.waitFor(() =>
    expect(snapshot?.documentMutationError).toBe('Fix the Playwright source before editing steps.'),
  );
  expect(mocks.save).not.toHaveBeenCalled();
  expect(snapshot?.source).toBe(source);
  let subscriptionError: string | undefined;
  const unsubscribeAgain = browserApi.onSnapshot((next) => {
    subscriptionError = next.documentMutationError;
  });
  expect(subscriptionError).toBe(snapshot?.documentMutationError);

  const validSource =
    "import { test } from '@playwright/test'; test('fixed', async ({ page }) => {});";
  mocks.save.mockImplementation(async () => {
    workspace.tests[0]!.currentRevision.content.source = validSource;
    return { status: 'saved' };
  });
  browserApi.command({ type: 'update-source', source: validSource, testId: 'test' });
  await vi.waitFor(() => expect(snapshot?.source).toBe(validSource));
  expect(snapshot?.documentMutationError).toBeUndefined();
  unsubscribe();
  unsubscribeAgain();
});
