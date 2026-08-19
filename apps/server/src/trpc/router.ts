import { TRPCError, initTRPC } from '@trpc/server';

import {
  createEnvironmentProcedure,
  createProjectProcedure,
  createTestProcedure,
  desktopLoginPollInputSchema,
  desktopLoginPollOutputSchema,
  desktopLoginStartInputSchema,
  desktopLoginStartOutputSchema,
  getTestProcedure,
  getTestRevisionHistoryProcedure,
  getWorkspaceProcedure,
  saveTestRevisionProcedure,
} from '@testron/protocol';
import type { AuthenticatedUser, AuthenticationService } from '../auth.js';
import { RepositoryError, type CanonicalRepository } from '../database/repository.js';

export interface TrpcContext {
  user?: AuthenticatedUser;
}

export interface RouterServices {
  authentication: AuthenticationService;
  repository: CanonicalRepository;
}

const t = initTRPC.context<TrpcContext>().create();
const publicProcedure = t.procedure;
const authenticatedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const mapRepositoryError = (error: unknown): never => {
  if (!(error instanceof RepositoryError)) throw error;
  const code =
    error.code === 'FORBIDDEN'
      ? 'FORBIDDEN'
      : error.code === 'NOT_FOUND'
        ? 'NOT_FOUND'
        : error.code === 'GONE'
          ? 'TIMEOUT'
          : 'CONFLICT';
  throw new TRPCError({ code, message: error.message, cause: error });
};

const call = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    return mapRepositoryError(error);
  }
};

export const createAppRouter = ({ authentication, repository }: RouterServices) =>
  t.router({
    auth: t.router({
      start: publicProcedure
        .input(desktopLoginStartInputSchema)
        .output(desktopLoginStartOutputSchema)
        .mutation(({ input }) => authentication.startDesktopLogin(input)),
      poll: publicProcedure
        .input(desktopLoginPollInputSchema)
        .output(desktopLoginPollOutputSchema)
        .mutation(({ input }) => authentication.pollDesktopLogin(input)),
    }),
    project: t.router({
      create: authenticatedProcedure
        .input(createProjectProcedure.input)
        .output(createProjectProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createProject(ctx.user, input))),
    }),
    environment: t.router({
      create: authenticatedProcedure
        .input(createEnvironmentProcedure.input)
        .output(createEnvironmentProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createEnvironment(ctx.user, input))),
    }),
    workspace: t.router({
      get: authenticatedProcedure
        .input(getWorkspaceProcedure.input)
        .output(getWorkspaceProcedure.output)
        .query(({ ctx }) => call(() => repository.getWorkspace(ctx.user))),
    }),
    test: t.router({
      create: authenticatedProcedure
        .input(createTestProcedure.input)
        .output(createTestProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createTest(ctx.user, input))),
      get: authenticatedProcedure
        .input(getTestProcedure.input)
        .output(getTestProcedure.output)
        .query(({ ctx, input }) => call(() => repository.getTest(ctx.user, input.testId))),
      history: authenticatedProcedure
        .input(getTestRevisionHistoryProcedure.input)
        .output(getTestRevisionHistoryProcedure.output)
        .query(({ ctx, input }) => call(() => repository.getRevisionHistory(ctx.user, input))),
      saveRevision: authenticatedProcedure
        .input(saveTestRevisionProcedure.input)
        .output(saveTestRevisionProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.saveTestRevision(ctx.user, input))),
    }),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;
