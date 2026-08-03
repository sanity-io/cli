import {getSanityUrl} from './getSanityUrl.js'

export function getCoreAppUrl(organizationId: string, appId: string): string {
  return getSanityUrl(`/@${organizationId}/application/${appId}`)
}
