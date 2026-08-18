import { z } from 'zod';

/** The transport contract version. It intentionally does not track step versions. */
export const PROTOCOL_SCHEMA_VERSION = 1 as const;
export const MIN_SUPPORTED_PROTOCOL_SCHEMA_VERSION = 1 as const;
export const MAX_SUPPORTED_PROTOCOL_SCHEMA_VERSION = 1 as const;

/** The structured-step versions accepted inside protocol v1 test content. */
export const SUPPORTED_STEP_SCHEMA_VERSIONS = [1] as const;

export const protocolSchemaVersionSchema = z.literal(PROTOCOL_SCHEMA_VERSION);
export const stepSchemaVersionSchema = z.literal(1);

export type ProtocolSchemaVersion = z.infer<typeof protocolSchemaVersionSchema>;
export type StepSchemaVersion = z.infer<typeof stepSchemaVersionSchema>;
