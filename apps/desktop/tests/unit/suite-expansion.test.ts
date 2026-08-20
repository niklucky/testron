import { describe, expect, it } from 'vitest';

import {
  loadExpandedSuiteIds,
  saveExpandedSuiteIds,
} from '../../src/renderer/dashboard/suiteExpansion';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('test-suite expansion persistence', () => {
  it('restores an expanded suite after dashboard navigation', () => {
    const storage = new MemoryStorage();
    saveExpandedSuiteIds(storage, 'project-a', ['suite-2']);

    expect(
      loadExpandedSuiteIds(storage, 'project-a', new Set(['suite-1', 'suite-2']), ['suite-1']),
    ).toEqual(['suite-2']);
  });

  it('keeps expansion state isolated by project', () => {
    const storage = new MemoryStorage();
    saveExpandedSuiteIds(storage, 'project-a', ['suite-a']);
    saveExpandedSuiteIds(storage, 'project-b', ['suite-b']);

    expect(loadExpandedSuiteIds(storage, 'project-a', new Set(['suite-a']))).toEqual(['suite-a']);
    expect(loadExpandedSuiteIds(storage, 'project-b', new Set(['suite-b']))).toEqual(['suite-b']);
  });

  it('removes deleted suites when expansion is restored', () => {
    const storage = new MemoryStorage();
    saveExpandedSuiteIds(storage, 'project-a', ['existing', 'deleted']);

    expect(loadExpandedSuiteIds(storage, 'project-a', new Set(['existing']))).toEqual(['existing']);
    expect(loadExpandedSuiteIds(storage, 'project-a', new Set(['existing', 'deleted']))).toEqual([
      'existing',
    ]);
  });

  it('distinguishes an explicitly collapsed tree from a new project default', () => {
    const storage = new MemoryStorage();
    const validIds = new Set(['checkout']);

    expect(loadExpandedSuiteIds(storage, 'new-project', validIds, ['checkout'])).toEqual([
      'checkout',
    ]);
    saveExpandedSuiteIds(storage, 'new-project', []);
    expect(loadExpandedSuiteIds(storage, 'new-project', validIds, ['checkout'])).toEqual([]);
  });
});
