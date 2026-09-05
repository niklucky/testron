import { z } from 'zod';
import { entityIdSchema, mutationMetadataSchema, timestampSchema } from './common';

export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_TEST_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const MAX_TEST_SCREENSHOTS = 10;
export const screenshotMimeTypeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);
export const screenshotUploadSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    mimeType: screenshotMimeTypeSchema,
    base64: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  })
  .strict();
export const screenshotUploadsSchema = z
  .array(screenshotUploadSchema)
  .max(MAX_TEST_SCREENSHOTS)
  .refine(
    (items) =>
      items.reduce(
        (sum, item) =>
          sum +
          (item.base64.length * 3) / 4 -
          (item.base64.endsWith('==') ? 2 : item.base64.endsWith('=') ? 1 : 0),
        0,
      ) <= MAX_TEST_SCREENSHOT_BYTES,
    'Screenshots may total at most 10 MB per test.',
  );
export const testAttachmentSchema = z
  .object({
    id: entityIdSchema,
    testId: entityIdSchema,
    name: z.string(),
    mimeType: screenshotMimeTypeSchema,
    size: z.number().int().positive().max(MAX_SCREENSHOT_BYTES),
    createdAt: timestampSchema,
    createdBy: entityIdSchema,
  })
  .strict();
export const addTestAttachmentRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    testId: entityIdSchema,
    screenshot: screenshotUploadSchema,
  })
  .strict();
export const deleteTestAttachmentRequestSchema = z
  .object({
    meta: mutationMetadataSchema,
    testId: entityIdSchema,
    attachmentId: entityIdSchema,
  })
  .strict();
export type ScreenshotUpload = z.infer<typeof screenshotUploadSchema>;
export type TestAttachment = z.infer<typeof testAttachmentSchema>;
export type AddTestAttachmentRequest = z.infer<typeof addTestAttachmentRequestSchema>;
export type DeleteTestAttachmentRequest = z.infer<typeof deleteTestAttachmentRequestSchema>;
