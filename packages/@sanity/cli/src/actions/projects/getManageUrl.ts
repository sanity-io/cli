import {getSanityUrl} from '@sanity/cli-core/util'

export function getManageUrl(projectId: string | undefined): string {
  return projectId ? getSanityUrl(`/manage/project/${projectId}`) : getSanityUrl('/manage/')
}
