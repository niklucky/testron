import type { MutationMetadata, RequestMetadata } from '@testron/protocol';

export const requestMeta = (): RequestMetadata => ({
  protocolVersion: 1,
  requestId: crypto.randomUUID(),
  client: { kind: 'web', version: '0.0.1' },
  supportedStepVersions: [1],
});

export const mutationMeta = (scope: string): MutationMetadata => ({
  ...requestMeta(),
  idempotencyKey: `web-${scope}-${crypto.randomUUID()}`,
});
