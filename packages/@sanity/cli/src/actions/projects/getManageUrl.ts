import {getSanityUrl} from '@sanity/cli-core'

export function getManageUrl(projectId: string | undefined): string {
  const sanityUrl = getSanityUrl()
  return projectId ? `${sanityUrl}/manage/project/${projectId}` : `${sanityUrl}/manage/`
}
