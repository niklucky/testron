const STORAGE_KEY = 'testron-expanded-test-suites';

type ExpansionStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type ExpansionSurface = 'sidebar' | 'overview';

type StoredExpansion = {
  version: 1;
  projects: Record<string, string[]>;
};

const emptyState = (): StoredExpansion => ({ version: 1, projects: {} });

const readState = (storage: ExpansionStorage): StoredExpansion => {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      parsed.version !== 1 ||
      !('projects' in parsed) ||
      typeof parsed.projects !== 'object' ||
      parsed.projects === null
    ) {
      return emptyState();
    }
    return parsed as StoredExpansion;
  } catch {
    return emptyState();
  }
};

const writeState = (storage: ExpansionStorage, state: StoredExpansion) => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Expansion is a convenience. A full or unavailable storage area should
    // never prevent the dashboard from rendering or accepting input.
  }
};

const validUniqueIds = (ids: unknown, validIds: ReadonlySet<string>) => {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && validIds.has(id)))];
};

const projectKey = (projectId: string, surface: ExpansionSurface) =>
  surface === 'sidebar' ? projectId : `${surface}:${projectId}`;

export const loadExpandedSuiteIds = (
  storage: ExpansionStorage,
  projectId: string,
  validIds: ReadonlySet<string>,
  defaultIds: readonly string[] = [],
  surface: ExpansionSurface = 'sidebar',
) => {
  const state = readState(storage);
  const key = projectKey(projectId, surface);
  if (!(key in state.projects)) return validUniqueIds(defaultIds, validIds);

  const storedIds = state.projects[key];
  const expandedIds = validUniqueIds(storedIds, validIds);
  if (!Array.isArray(storedIds) || expandedIds.length !== storedIds.length) {
    state.projects[key] = expandedIds;
    writeState(storage, state);
  }
  return expandedIds;
};

export const saveExpandedSuiteIds = (
  storage: ExpansionStorage,
  projectId: string,
  expandedIds: readonly string[],
  surface: ExpansionSurface = 'sidebar',
) => {
  const state = readState(storage);
  state.projects[projectKey(projectId, surface)] = [...new Set(expandedIds)];
  writeState(storage, state);
};
