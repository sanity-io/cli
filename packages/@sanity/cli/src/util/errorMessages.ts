export const NO_PROJECT_ID = `sanity.cli.ts does not contain a project identifier ("api.projectId"), which is required for the Sanity CLI to communicate with the Sanity API`
export const NO_ORGANIZATION_ID = `sanity.cli.ts does not contain an organization identifier ("app.organizationId"), which is required for the Sanity CLI to communicate with the Sanity API`
export const NO_MEDIA_LIBRARY_ASPECTS_PATH = `sanity.cli.ts does not contain a media library aspects path ("mediaLibrary.aspectsPath"), which is required for the Sanity CLI to manage aspects.`
export const EXTERNAL_APP_NOT_SUPPORTED = `Deploying an app to an external host is not supported.`
export const APP_ID_NOT_FOUND_IN_ORGANIZATION = `The \`appId\` provided in your configuration’s \`deployment\` object cannot be found in your organization`

export function cannotPromptForStudioHost(isExternal: boolean): string {
  const subject = isExternal ? 'external studio URL' : 'studio hostname'
  return `Cannot prompt for ${subject} in unattended mode. Use --url to specify the ${subject}.`
}
