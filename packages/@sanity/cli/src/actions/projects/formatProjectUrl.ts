export function formatProjectUrl(projectId: string, apiHost: string): string {
  const mainHostname = new URL(apiHost).hostname.split('.').slice(-2).join('.')
  return `https://www.${mainHostname}/manage/project/${projectId}`
}
