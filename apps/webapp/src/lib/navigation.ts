const projectId = () => window.location.pathname.split('/')[2];

export const goToDashboard = (targetProjectId = projectId()) => {
  void import('../router').then(({ router }) =>
    router.navigate({
      to: '/projects/$projectId',
      params: { projectId: targetProjectId },
    }),
  );
};
export const goToRuns = () => {
  const currentProjectId = projectId();
  void import('../router').then(({ router }) =>
    router.navigate({
      to: '/projects/$projectId/runs',
      params: { projectId: currentProjectId },
    }),
  );
};
export const goToTest = (testId: string, targetProjectId = projectId()) => {
  void import('../router').then(({ router }) =>
    router.navigate({
      to: '/projects/$projectId/tests/$testId',
      params: { projectId: targetProjectId, testId },
    }),
  );
};
export const goToRecorder = (selection?: { projectId: string; testId: string }) => {
  if (window.testronDesktop) {
    window.testronDesktop.openLocal({
      route: 'record',
      projectId: selection?.projectId ?? projectId(),
      testId: selection?.testId ?? window.location.pathname.split('/')[4],
    });
    return;
  }
  window.location.hash = '#/record';
};
export const goToSelectedTest = () => {
  const currentProjectId = projectId();
  const testId = window.location.pathname.split('/')[4];
  if (testId) {
    void import('../router').then(({ router }) =>
      router.navigate({
        to: '/projects/$projectId/tests/$testId',
        params: { projectId: currentProjectId, testId },
      }),
    );
    return;
  }
  goToDashboard();
};
