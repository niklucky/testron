import { TRPCError, initTRPC } from '@trpc/server';

import {
  authLoginInputSchema,
  authRegisterInputSchema,
  authSessionOutputSchema,
  createEnvironmentProcedure,
  createProfileProcedure,
  createProjectProcedure,
  createTestProcedure,
  createTestSuiteProcedure,
  deleteTestSuiteProcedure,
  getTestProcedure,
  getTestRevisionHistoryProcedure,
  getWorkspaceProcedure,
  listTestSuitesProcedure,
  finishTestRunProcedure,
  saveTestRevisionProcedure,
  startTestRunProcedure,
  updateEnvironmentProcedure,
  updateProfileProcedure,
  updateProjectProcedure,
  updateTestSuiteProcedure,
} from '@testron/protocol';
import {
  AuthenticationError,
  type AuthenticatedUser,
  type AuthenticationService,
} from '../auth.js';
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

const callAuthentication = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof AuthenticationError)) throw error;
    throw new TRPCError({
      code: error.code === 'EMAIL_TAKEN' ? 'CONFLICT' : 'UNAUTHORIZED',
      message: error.message,
      cause: error,
    });
  }
};

export const createAppRouter = ({ authentication, repository }: RouterServices) =>
  t.router({
    auth: t.router({
      register: publicProcedure
        .input(authRegisterInputSchema)
        .output(authSessionOutputSchema)
        .mutation(({ input }) => callAuthentication(() => authentication.register(input))),
      login: publicProcedure
        .input(authLoginInputSchema)
        .output(authSessionOutputSchema)
        .mutation(({ input }) => callAuthentication(() => authentication.login(input))),
    }),
    project: t.router({
      create: authenticatedProcedure
        .input(createProjectProcedure.input)
        .output(createProjectProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createProject(ctx.user, input))),
      update: authenticatedProcedure
        .input(updateProjectProcedure.input)
        .output(updateProjectProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.updateProject(ctx.user, input))),
    }),
    environment: t.router({
      create: authenticatedProcedure
        .input(createEnvironmentProcedure.input)
        .output(createEnvironmentProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createEnvironment(ctx.user, input))),
      update: authenticatedProcedure
        .input(updateEnvironmentProcedure.input)
        .output(updateEnvironmentProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.updateEnvironment(ctx.user, input))),
    }),
    profile: t.router({
      create: authenticatedProcedure
        .input(createProfileProcedure.input)
        .output(createProfileProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createProfile(ctx.user, input))),
      update: authenticatedProcedure
        .input(updateProfileProcedure.input)
        .output(updateProfileProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.updateProfile(ctx.user, input))),
    }),
    testSuite: t.router({
      create: authenticatedProcedure
        .input(createTestSuiteProcedure.input)
        .output(createTestSuiteProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createTestSuite(ctx.user, input))),
      list: authenticatedProcedure
        .input(listTestSuitesProcedure.input)
        .output(listTestSuitesProcedure.output)
        .query(({ ctx, input }) =>
          call(() => repository.listTestSuites(ctx.user, input.projectId)),
        ),
      update: authenticatedProcedure
        .input(updateTestSuiteProcedure.input)
        .output(updateTestSuiteProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.updateTestSuite(ctx.user, input))),
      delete: authenticatedProcedure
        .input(deleteTestSuiteProcedure.input)
        .output(deleteTestSuiteProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.deleteTestSuite(ctx.user, input))),
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
    run: t.router({
      start: authenticatedProcedure
        .input(startTestRunProcedure.input)
        .output(startTestRunProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.startTestRun(ctx.user, input))),
      finish: authenticatedProcedure
        .input(finishTestRunProcedure.input)
        .output(finishTestRunProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.finishTestRun(ctx.user, input))),
    }),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;
