import { describe, expect, it, vi } from 'vitest';

import { openDashboardTest } from '../../src/renderer/dashboard/navigation';

describe('dashboard test navigation', () => {
  it('selects the test before opening TestView', () => {
    const command = vi.fn();
    const route = { hash: '#/' };

    openDashboardTest({ id: 'suite-1-test-2' }, { command }, route);

    expect(command).toHaveBeenCalledWith({ type: 'select-test', testId: 'suite-1-test-2' });
    expect(route.hash).toBe('#/test');
  });
});
