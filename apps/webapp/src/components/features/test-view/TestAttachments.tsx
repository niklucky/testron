import { useEffect, useState } from 'react';
import { useTranslation } from '@warpunit/slang-react';
import type { ScreenshotUpload, TestAttachment } from '@testron/protocol';
import { ScreenshotPicker } from '@testron/ui/screenshot-picker';
import { trpcClient } from '../../../lib/trpc';
import { mutationMeta } from '../../../lib/meta';
import { Button } from '../../ui/design';

const EMPTY_ATTACHMENTS: TestAttachment[] = [];
export const TestAttachments = ({
  testId,
  attachments: initialAttachments = EMPTY_ATTACHMENTS,
}: {
  testId: string;
  attachments?: TestAttachment[];
}) => {
  const { t } = useTranslation();
  const [attachments, setAttachments] = useState(initialAttachments);
  const [selected, setSelected] = useState<ScreenshotUpload[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setAttachments(initialAttachments), [initialAttachments]);
  const refresh = () => window.testron?.command({ type: 'refresh-workspace' });
  return (
    <div className="space-y-3">
      {attachments.length > 0 && (
        <ul className="space-y-3">
          {attachments.map((attachment) => {
            const url = `/api/tests/${testId}/attachments/${attachment.id}`;
            return (
              <li key={attachment.id} className="rounded-lg border border-line bg-surface p-3">
                <a href={url} target="_blank" rel="noreferrer">
                  <img
                    src={url}
                    alt={attachment.name}
                    className="max-h-48 w-full rounded object-contain"
                  />
                </a>
                <p className="my-2 break-words text-ink-2">{attachment.name}</p>
                <Button
                  icon="trash"
                  size="sm"
                  disabled={busy || reading}
                  aria-label={`${t('delete_screenshot')} ${attachment.name}`}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const snapshot = await trpcClient.test.deleteAttachment.mutate({
                        meta: mutationMeta('delete-screenshot'),
                        testId,
                        attachmentId: attachment.id,
                      });
                      setAttachments(snapshot.attachments ?? []);
                      refresh();
                    } catch (error) {
                      setError(
                        error instanceof Error ? error.message : t('screenshot_upload_failed'),
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t('delete_screenshot')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="rounded-lg border border-line bg-surface p-3">
        <ScreenshotPicker
          value={selected}
          onChange={setSelected}
          onBusyChange={setReading}
          disabled={busy}
          existingCount={attachments.length}
          existingSize={attachments.reduce((sum, attachment) => sum + attachment.size, 0)}
        />
        {selected.length > 0 && (
          <Button
            className="mt-3"
            variant="primary"
            disabled={busy || reading}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                for (let index = 0; index < selected.length; index++) {
                  const snapshot = await trpcClient.test.addAttachment.mutate({
                    meta: mutationMeta('add-screenshot'),
                    testId,
                    screenshot: selected[index]!,
                  });
                  setAttachments(snapshot.attachments ?? []);
                  setSelected(selected.slice(index + 1));
                }
              } catch (error) {
                setError(error instanceof Error ? error.message : t('screenshot_upload_failed'));
              } finally {
                refresh();
                setBusy(false);
              }
            }}
          >
            {t('upload_screenshots')}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-critical">
          {error}
        </p>
      )}
    </div>
  );
};
