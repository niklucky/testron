import { createHash } from 'node:crypto';
import { TRPCError, initTRPC } from '@trpc/server';

import {
  authLoginInputSchema,
  authPasswordResetOutputSchema,
  authPasswordResetRequestedOutputSchema,
  authRegisterInputSchema,
  authRequestPasswordResetInputSchema,
  authResetPasswordInputSchema,
  authSessionOutputSchema,
  cancelInvitationProcedure,
  changeAccountPasswordProcedure,
  createEnvironmentProcedure,
  createBrowserAuthenticationFlowProcedure,
  updateBrowserAuthenticationFlowProcedure,
  deleteBrowserAuthenticationFlowProcedure,
  configureProfileEnvironmentAuthenticationProcedure,
  createProjectSecretProcedure,
  replaceProjectSecretProcedure,
  deleteProjectSecretProcedure,
  manageAuthenticationStateProcedure,
  createInvitationProcedure,
  createProfileProcedure,
  createProjectProcedure,
  createTestProcedure,
  createTestSuiteProcedure,
  createRunScheduleProcedure,
  updateRunScheduleProcedure,
  deleteRunScheduleProcedure,
  enqueueRunScheduleProcedure,
  deleteTestSuiteProcedure,
  deleteTestProcedure,
  getTestProcedure,
  getTestRevisionHistoryProcedure,
  getWorkspaceProcedure,
  getWebWorkspaceProcedure,
  listTestSuitesProcedure,
  lookupInviteeProcedure,
  moveTestProcedure,
  finishTestRunProcedure,
  saveTestRevisionProcedure,
  startTestRunProcedure,
  respondInvitationProcedure,
  setMemberBlockedProcedure,
  updateAccountProfileProcedure,
  updateEnvironmentProcedure,
  updateProfileProcedure,
  updateProjectProcedure,
  updateTestSuiteProcedure,
  type AuthSessionOutput,
} from '@testron/protocol';
import {
  AuthenticationError,
  type AuthenticatedUser,
  type AuthenticationService,
} from '../auth.js';
import { RepositoryError, type CanonicalRepository } from '../database/repository.js';

export interface TrpcContext {
  user?: AuthenticatedUser;
  requestIp?: string;
  setSession?(session: AuthSessionOutput): void;
}

export interface RouterServices {
  authentication: AuthenticationService;
  repository: CanonicalRepository;
  runQueue?: { wake(): void };
}

const t = initTRPC.context<TrpcContext>().create();
const publicProcedure = t.procedure;
const passwordResetAttempts = new Map<string, { count: number; resetsAt: number }>();
const passwordResetAllowed = (email: string, requestIp: string | undefined): boolean => {
  const now = Date.now();
  const windowMs = 15 * 60_000;
  const keys = [
    { key: `email:${createHash('sha256').update(email).digest('hex')}`, limit: 3 },
    { key: `ip:${requestIp ?? 'unknown'}`, limit: 10 },
  ];
  let allowed = true;
  for (const { key, limit } of keys) {
    const current = passwordResetAttempts.get(key);
    const bucket =
      !current || current.resetsAt <= now ? { count: 0, resetsAt: now + windowMs } : current;
    bucket.count += 1;
    passwordResetAttempts.set(key, bucket);
    if (bucket.count > limit) allowed = false;
  }
  if (passwordResetAttempts.size > 10_000)
    for (const [key, bucket] of passwordResetAttempts)
      if (bucket.resetsAt <= now) passwordResetAttempts.delete(key);
  return allowed;
};
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

export const createAppRouter = ({ authentication, repository, runQueue }: RouterServices) =>
  t.router({
    auth: t.router({
      register: publicProcedure
        .input(authRegisterInputSchema)
        .output(authSessionOutputSchema)
        .mutation(async ({ ctx, input }) => {
          const session = await callAuthentication(() => authentication.register(input));
          ctx.setSession?.(session);
          return session;
        }),
      login: publicProcedure
        .input(authLoginInputSchema)
        .output(authSessionOutputSchema)
        .mutation(async ({ ctx, input }) => {
          const session = await callAuthentication(() => authentication.login(input));
          ctx.setSession?.(session);
          return session;
        }),
      requestPasswordReset: publicProcedure
        .input(authRequestPasswordResetInputSchema)
        .output(authPasswordResetRequestedOutputSchema)
        .mutation(({ ctx, input }) =>
          passwordResetAllowed(input.email, ctx.requestIp)
            ? callAuthentication(() => authentication.requestPasswordReset(input))
            : { accepted: true as const },
        ),
      resetPassword: publicProcedure
        .input(authResetPasswordInputSchema)
        .output(authPasswordResetOutputSchema)
        .mutation(({ input }) => callAuthentication(() => authentication.resetPassword(input))),
    }),
    account: t.router({
      updateProfile: authenticatedProcedure
        .input(updateAccountProfileProcedure.input)
        .output(updateAccountProfileProcedure.output)
        .mutation(({ ctx, input }) =>
          callAuthentication(() => authentication.updateProfile(ctx.user, input)),
        ),
      changePassword: authenticatedProcedure
        .input(changeAccountPasswordProcedure.input)
        .output(changeAccountPasswordProcedure.output)
        .mutation(({ ctx, input }) =>
          callAuthentication(() => authentication.changePassword(ctx.user, input)),
        ),
    }),
    invitation: t.router({
      lookup: authenticatedProcedure
        .input(lookupInviteeProcedure.input)
        .output(lookupInviteeProcedure.output)
        .query(({ ctx, input }) => call(() => repository.lookupInvitee(ctx.user, input.email))),
      create: authenticatedProcedure
        .input(createInvitationProcedure.input)
        .output(createInvitationProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createInvitation(ctx.user, input))),
      respond: authenticatedProcedure
        .input(respondInvitationProcedure.input)
        .output(respondInvitationProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.respondInvitation(ctx.user, input))),
      cancel: authenticatedProcedure
        .input(cancelInvitationProcedure.input)
        .output(cancelInvitationProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.cancelInvitation(ctx.user, input))),
    }),
    member: t.router({
      setBlocked: authenticatedProcedure
        .input(setMemberBlockedProcedure.input)
        .output(setMemberBlockedProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.setMemberBlocked(ctx.user, input))),
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
    authenticationFlow: t.router({
      create: authenticatedProcedure
        .input(createBrowserAuthenticationFlowProcedure.input)
        .output(createBrowserAuthenticationFlowProcedure.output)
        .mutation(({ ctx, input }) =>
          call(() => repository.createBrowserAuthenticationFlow(ctx.user, input)),
        ),
      update: authenticatedProcedure
        .input(updateBrowserAuthenticationFlowProcedure.input)
        .output(updateBrowserAuthenticationFlowProcedure.output)
        .mutation(({ ctx, input }) =>
          call(() => repository.updateBrowserAuthenticationFlow(ctx.user, input)),
        ),
      delete: authenticatedProcedure
        .input(deleteBrowserAuthenticationFlowProcedure.input)
        .output(deleteBrowserAuthenticationFlowProcedure.output)
        .mutation(({ ctx, input }) =>
          call(() => repository.deleteBrowserAuthenticationFlow(ctx.user, input)),
        ),
      configureProfile: authenticatedProcedure
        .input(configureProfileEnvironmentAuthenticationProcedure.input)
        .output(configureProfileEnvironmentAuthenticationProcedure.output)
        .mutation(({ ctx, input }) =>
          call(() => repository.configureProfileEnvironmentAuthentication(ctx.user, input)),
        ),
    }),
    projectSecret: t.router({
      create: authenticatedProcedure
        .input(createProjectSecretProcedure.input)
        .output(createProjectSecretProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createProjectSecret(ctx.user, input))),
      replace: authenticatedProcedure
        .input(replaceProjectSecretProcedure.input)
        .output(replaceProjectSecretProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.replaceProjectSecret(ctx.user, input))),
      delete: authenticatedProcedure
        .input(deleteProjectSecretProcedure.input)
        .output(deleteProjectSecretProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.deleteProjectSecret(ctx.user, input))),
    }),
    authenticationState: t.router({
      manage: authenticatedProcedure
        .input(manageAuthenticationStateProcedure.input)
        .output(manageAuthenticationStateProcedure.output)
        .mutation(({ ctx, input }) =>
          call(() => repository.manageAuthenticationState(ctx.user, input)),
        ),
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
      getWeb: authenticatedProcedure
        .input(getWebWorkspaceProcedure.input)
        .output(getWebWorkspaceProcedure.output)
        .query(({ ctx }) =>
          call(async () => {
            const workspace = await repository.getWorkspace(ctx.user);
            return {
              ...workspace,
              profiles: workspace.profiles.map((profile) => ({
                ...profile,
                environments: profile.environments.map((environment) => ({
                  ...environment,
                  variables: environment.variables.map(({ name, sensitive }) => ({
                    name,
                    sensitive,
                  })),
                })),
              })),
            };
          }),
        ),
    }),
    test: t.router({
      create: authenticatedProcedure
        .input(createTestProcedure.input)
        .output(createTestProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createTest(ctx.user, input))),
      delete: authenticatedProcedure
        .input(deleteTestProcedure.input)
        .output(deleteTestProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.deleteTest(ctx.user, input))),
      move: authenticatedProcedure
        .input(moveTestProcedure.input)
        .output(moveTestProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.moveTest(ctx.user, input))),
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
    runSchedule: t.router({
      create: authenticatedProcedure
        .input(createRunScheduleProcedure.input)
        .output(createRunScheduleProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.createRunSchedule(ctx.user, input))),
      update: authenticatedProcedure
        .input(updateRunScheduleProcedure.input)
        .output(updateRunScheduleProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.updateRunSchedule(ctx.user, input))),
      delete: authenticatedProcedure
        .input(deleteRunScheduleProcedure.input)
        .output(deleteRunScheduleProcedure.output)
        .mutation(({ ctx, input }) => call(() => repository.deleteRunSchedule(ctx.user, input))),
      enqueue: authenticatedProcedure
        .input(enqueueRunScheduleProcedure.input)
        .output(enqueueRunScheduleProcedure.output)
        .mutation(async ({ ctx, input }) => {
          const jobs = await call(() => repository.enqueueRunSchedule(ctx.user, input));
          runQueue?.wake();
          return jobs;
        }),
    }),
  });

export type AppRouter = ReturnType<typeof createAppRouter>;
