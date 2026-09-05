import { useState } from 'react';
import { useTranslation } from '@warpunit/slang-react';

import { NewTestForm } from './NewTestForm';
import { goToTest } from '../../../lib/navigation';
import type { LibrarySnapshot } from '../../../lib/library';
import { Badge, Button, Panel } from '../../ui/design';

export const TestRequests = ({ library }: { library: LibrarySnapshot }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const projectId = library.selectedProjectId;
  const environments = library.environments.filter((item) => item.projectId === projectId);
  const requests = library.tests.filter(
    (test) => test.projectId === projectId && test.status === 'requested',
  );
  return (
    <Panel className="mt-4 shrink-0">
      <div
        className={`flex items-center justify-between gap-4 px-4 py-3 ${requests.length > 0 ? 'border-b border-line-soft' : ''}`}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-md font-semibold">{t('test_requests')}</h2>
            {requests.length === 0 && <Badge>{t('no_test_requests')}</Badge>}
          </div>
          {requests.length > 0 && <p className="mt-0.5 text-ink-3">{t('test_requests_help')}</p>}
        </div>
        <Button onClick={() => setOpen(true)} disabled={!projectId || environments.length === 0}>
          {t('request_test')}
        </Button>
      </div>
      {requests.length > 0 && (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left">
            <thead className="text-ink-3">
              <tr>
                <th className="px-4 py-2">{t('test_title')}</th>
                <th className="px-4 py-2">{t('description_draft')}</th>
                <th className="px-4 py-2">{t('environments')}</th>
                <th className="px-4 py-2">{t('status')}</th>
                <th className="px-4 py-2">{t('test_request_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 align-top">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => {
                        window.testron?.command({ type: 'select-test', testId: request.id });
                        goToTest(request.id, projectId);
                      }}
                    >
                      {request.title}
                    </button>
                  </td>
                  <td className="max-w-xl whitespace-pre-wrap break-words px-4 py-3">
                    {request.description}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {request.environmentIds
                      .map(
                        (id) =>
                          environments.find((environment) => environment.id === id)?.name ?? id,
                      )
                      .join(', ')}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge>{t('requested')}</Badge>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Button
                      onClick={() =>
                        window.testron?.command({
                          type: 'complete-test-request',
                          testId: request.id,
                        })
                      }
                    >
                      {t('mark_ready')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <NewTestForm
          heading={t('request_test')}
          environments={environments}
          initialEnvironmentIds={
            library.selectedEnvironmentId ? [library.selectedEnvironmentId] : undefined
          }
          onClose={() => setOpen(false)}
          onRequest={(title, environmentIds, description, screenshots) => {
            if (!projectId || environmentIds.length === 0) return;
            window.testron?.command({
              type: 'create-test',
              projectId,
              testSuiteId: null,
              environmentIds,
              title,
              description,
              screenshots,
              status: 'requested',
            });
            setOpen(false);
          }}
        />
      )}
    </Panel>
  );
};
