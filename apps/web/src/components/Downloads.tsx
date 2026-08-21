import { useEffect, useState } from 'react';

import {
  downloadUrl,
  fetchLatestRelease,
  formatReleaseDate,
  releasesUrl,
  type Release,
} from '../lib/downloads';
import { detectPlatform, platform, platforms, type PlatformId } from '../lib/platform';
import { DownloadIcon } from './Icons';

/** Detection resolves after a promise, so the button starts as a placeholder
    rather than flashing the wrong platform and then correcting itself. */
type Detection = { state: 'pending' } | { state: 'done'; id: PlatformId | undefined };

export const Downloads = () => {
  const [detection, setDetection] = useState<Detection>({ state: 'pending' });
  const [release, setRelease] = useState<Release | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void detectPlatform().then((id) => {
      if (live) setDetection({ state: 'done', id });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLatestRelease(controller.signal).then(setRelease);
    return () => controller.abort();
  }, []);

  const detected = detection.state === 'done' ? detection.id : undefined;
  const others = platforms.filter((entry) => entry.id !== detected);
  const published = formatReleaseDate(release?.publishedAt);

  return (
    <section
      className="w-full rounded-xl border border-line bg-surface p-5 sm:p-6"
      aria-labelledby="download-heading"
    >
      <h2 id="download-heading" className="sr-only">
        Download Testron
      </h2>

      {detected ? (
        <a
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-center text-md font-medium text-accent-ink transition-[filter] hover:brightness-110 sm:px-5 sm:text-lg"
          href={downloadUrl(detected)}
        >
          {/* On a narrow screen the glyph is what pushes the label onto a
              second line, and the label is the part that carries meaning. */}
          <span className="hidden sm:inline-flex">
            <DownloadIcon />
          </span>
          Download for {platform(detected).label}
        </a>
      ) : (
        <p
          className="flex min-h-11 w-full items-center justify-center rounded-lg border border-line-soft bg-raised px-4 py-2 text-center text-md text-ink-2"
          aria-live="polite"
        >
          {detection.state === 'pending'
            ? 'Looking for your platform…'
            : 'Testron is a desktop application — pick a build for your computer.'}
        </p>
      )}

      <p className="mt-3 text-center text-md text-ink-3">
        {release ? (
          <>
            <span className="ui-mono text-ink-2">{release.version}</span>
            {published ? ` · ${published}` : ''} · free during the alpha
          </>
        ) : (
          'Free during the alpha'
        )}
      </p>

      <div className="mt-5 border-t border-line-soft pt-4">
        <p className="text-md text-ink-3">{detected ? 'Other platforms' : 'All platforms'}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {others.map((entry) => (
            <a
              key={entry.id}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-raised px-3 text-md font-medium text-ink-2 transition-colors hover:text-ink"
              href={downloadUrl(entry.id)}
            >
              <DownloadIcon size={13} />
              {entry.short}
            </a>
          ))}
        </div>
        <p className="mt-3 text-md text-ink-3">
          Every build is produced by GitHub Actions from the main branch.{' '}
          <a className="text-ink-2 underline underline-offset-2 hover:text-ink" href={releasesUrl}>
            Browse all releases
          </a>
          .
        </p>
      </div>
    </section>
  );
};
