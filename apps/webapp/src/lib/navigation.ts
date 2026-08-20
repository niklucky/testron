const projectId = () => window.location.pathname.split('/')[2];
export const goToDashboard = () => {
  window.location.pathname = `/projects/${projectId()}`;
};
export const goToRuns = () => {
  window.location.pathname = `/projects/${projectId()}/runs`;
};
export const goToSelectedTest = () => {
  const testId = window.location.pathname.split('/')[4];
  window.location.pathname = testId
    ? `/projects/${projectId()}/tests/${testId}`
    : `/projects/${projectId()}`;
};
