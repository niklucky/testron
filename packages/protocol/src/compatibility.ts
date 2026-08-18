import { z } from 'zod';

import {
  MAX_SUPPORTED_PROTOCOL_SCHEMA_VERSION,
  MIN_SUPPORTED_PROTOCOL_SCHEMA_VERSION,
  SUPPORTED_STEP_SCHEMA_VERSIONS,
} from './version';

export const compatibilityProbeSchema = z
  .object({
    protocolVersion: z.number().int(),
    stepSchemaVersion: z.number().int().optional(),
  })
  .passthrough();

export type Compatibility =
  | { status: 'supported' }
  | { status: 'invalid'; reason: string }
  | { status: 'protocol-too-old'; received: number; minimumSupported: number }
  | { status: 'protocol-too-new'; received: number; maximumSupported: number }
  | { status: 'unsupported-step-version'; received: number; supported: readonly number[] };

/**
 * Performs the version check that must run before an operation-specific schema parse.
 * This keeps an unsupported future payload distinct from an ordinary invalid payload.
 */
export const inspectCompatibility = (payload: unknown): Compatibility => {
  const record = typeof payload === 'object' && payload !== null ? payload : {};
  const meta =
    'meta' in record && typeof record.meta === 'object' && record.meta ? record.meta : {};
  const content =
    'content' in record && typeof record.content === 'object' && record.content
      ? record.content
      : {};
  const candidate = {
    protocolVersion:
      'protocolVersion' in meta
        ? meta.protocolVersion
        : 'protocolVersion' in record
          ? record.protocolVersion
          : undefined,
    ...('stepSchemaVersion' in content
      ? { stepSchemaVersion: content.stepSchemaVersion }
      : 'stepSchemaVersion' in record
        ? { stepSchemaVersion: record.stepSchemaVersion }
        : {}),
  };
  const probe = compatibilityProbeSchema.safeParse(candidate);
  if (!probe.success)
    return { status: 'invalid', reason: 'Payload does not declare an integer protocolVersion.' };

  if (probe.data.protocolVersion < MIN_SUPPORTED_PROTOCOL_SCHEMA_VERSION)
    return {
      status: 'protocol-too-old',
      received: probe.data.protocolVersion,
      minimumSupported: MIN_SUPPORTED_PROTOCOL_SCHEMA_VERSION,
    };
  if (probe.data.protocolVersion > MAX_SUPPORTED_PROTOCOL_SCHEMA_VERSION)
    return {
      status: 'protocol-too-new',
      received: probe.data.protocolVersion,
      maximumSupported: MAX_SUPPORTED_PROTOCOL_SCHEMA_VERSION,
    };
  if (
    probe.data.stepSchemaVersion !== undefined &&
    !SUPPORTED_STEP_SCHEMA_VERSIONS.some((version) => version === probe.data.stepSchemaVersion)
  )
    return {
      status: 'unsupported-step-version',
      received: probe.data.stepSchemaVersion,
      supported: SUPPORTED_STEP_SCHEMA_VERSIONS,
    };
  return { status: 'supported' };
};
