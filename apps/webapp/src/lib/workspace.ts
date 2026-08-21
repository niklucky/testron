import { useQuery, useQueryClient } from '@tanstack/react-query';

import { requestMeta } from './meta';
import { trpc } from './trpc';

const workspaceInput = { meta: requestMeta() };

export const workspaceQueryOptions = () => trpc.workspace.getWeb.queryOptions(workspaceInput);
export const useWorkspace = () => useQuery(workspaceQueryOptions());

export const useRefreshWorkspace = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.workspace.getWeb.queryKey() });
};
