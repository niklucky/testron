import type { TestSnapshot, WebWorkspaceSnapshot } from '@testron/protocol';

export function RepositoryTestView({
  snapshot,
  workspace,
}: {
  snapshot: TestSnapshot;
  workspace: WebWorkspaceSnapshot;
}) {
  const content = snapshot.currentRevision.content;
  const repository = content.repository!;
  const suite = workspace.testSuites.find((suite) => suite.id === snapshot.test.testSuiteId);
  return (
    <main className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <a className="text-accent" href={`/projects/${snapshot.test.projectId}/tests`}>
          ← All tests
        </a>
        <div>
          <p className="text-sm text-ink-3">
            {suite?.name ?? 'Unassigned'} · Revision {snapshot.currentRevision.number}
          </p>
          <h1 className="mt-2 text-2xl font-semibold">{snapshot.test.title}</h1>
          <p className="mt-2 font-mono text-sm text-ink-2">
            {repository.file}:{repository.line}
          </p>
          <p className="mt-1 text-sm text-ink-3">{repository.titlePath.join(' › ')}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-2">
          <strong className="text-ink">Managed in your repository</strong>
          <p className="mt-1">
            Edit this test locally and publish it with <code>testron push</code>. Run it in its
            Playwright project; execution from Testron is not available for repository tests yet.
          </p>
        </div>
        {content.description && (
          <p className="whitespace-pre-wrap text-ink-2">{content.description}</p>
        )}
        <section
          aria-label="Playwright source"
          className="overflow-hidden rounded-lg border border-line"
        >
          <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
            <h2 className="font-medium">Source · {repository.file}</h2>
            <button
              type="button"
              className="text-sm text-accent"
              onClick={() => void navigator.clipboard.writeText(content.source ?? '')}
            >
              Copy source
            </button>
          </div>
          <pre className="overflow-x-auto bg-plane p-4 text-sm leading-6">
            <code>{content.source}</code>
          </pre>
        </section>
        <p className="font-mono text-xs text-ink-3">Test ID: {snapshot.test.id}</p>
      </div>
    </main>
  );
}
