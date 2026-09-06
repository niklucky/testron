import { useId, useState } from 'react';
import { useTranslation } from '@warpunit/slang-react';
import { Icon } from '../design';
import {
  MAX_SCREENSHOT_BYTES,
  MAX_TEST_SCREENSHOT_BYTES,
  MAX_TEST_SCREENSHOTS,
  screenshotMimeTypeSchema,
  type ScreenshotUpload,
} from '@testron/protocol';

export const ScreenshotPicker = ({
  value,
  onChange,
  onBusyChange,
  disabled = false,
  existingSize = 0,
  existingCount = 0,
}: {
  value: ScreenshotUpload[];
  onChange: (value: ScreenshotUpload[]) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  existingSize?: number;
  existingCount?: number;
}) => {
  const { t } = useTranslation();
  const inputId = useId();
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block font-medium text-ink-2">
        {t('attach_screenshots')}
      </label>
      <p className="text-ink-3">{t('screenshot_limits')}</p>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        disabled={disabled || reading}
        className="block w-full text-ink-2"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (!files.length) return;
          setError('');
          setReading(true);
          onBusyChange?.(true);
          try {
            if (
              files.some(
                (file) =>
                  !screenshotMimeTypeSchema.safeParse(file.type).success ||
                  file.size === 0 ||
                  file.size > MAX_SCREENSHOT_BYTES,
              )
            )
              throw new Error(t('invalid_screenshot'));
            const currentSize = value.reduce(
              (sum, item) =>
                sum +
                (item.base64.length * 3) / 4 -
                (item.base64.endsWith('==') ? 2 : item.base64.endsWith('=') ? 1 : 0),
              existingSize,
            );
            if (
              existingCount + value.length + files.length > MAX_TEST_SCREENSHOTS ||
              files.reduce((sum, file) => sum + file.size, currentSize) > MAX_TEST_SCREENSHOT_BYTES
            )
              throw new Error(t('screenshot_total_limit'));
            const next = await Promise.all(
              files.map(async (file): Promise<ScreenshotUpload> => {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = () => reject(new Error(t('screenshot_read_failed')));
                  reader.readAsDataURL(file);
                });
                return {
                  name: file.name,
                  mimeType: screenshotMimeTypeSchema.parse(file.type),
                  base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
                };
              }),
            );
            onChange([...value, ...next]);
          } catch (error) {
            setError(error instanceof Error ? error.message : t('screenshot_read_failed'));
          } finally {
            setReading(false);
            onBusyChange?.(false);
          }
        }}
      />
      {error && (
        <p role="alert" className="text-critical">
          {error}
        </p>
      )}
      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {value.map((item, index) => (
            <li
              key={`${index}-${item.name}`}
              className="relative min-w-0 rounded-md border border-line p-2"
            >
              <img
                src={`data:${item.mimeType};base64,${item.base64}`}
                alt={item.name}
                className="h-24 w-full rounded object-contain"
              />
              <p className="truncate text-ink-3" title={item.name}>
                {item.name}
              </p>
              <button
                type="button"
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-sm transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                title={t('remove_screenshot')}
                disabled={disabled || reading}
                aria-label={`${t('remove_screenshot')} ${item.name}`}
                onClick={() => onChange(value.filter((_, candidate) => candidate !== index))}
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
