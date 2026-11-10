import {styleText} from 'node:util'

import {type CliConfig} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {isWorkbenchApp} from '../../defineApp.js'
import {getOrganizationApplication} from '../../services/applications.js'
import {fetchOrganizationName, request, settle} from '../dashboardSummary.js'

const DETAILS_TIMEOUT_MS = 3000
const PENDING = Symbol('pending')

export interface DevServerDetails {
  organizationName?: string
  version?: string
}

export async function fetchDevServerDetails(cliConfig: CliConfig): Promise<DevServerDetails> {
  const organizationId = cliConfig.app?.organizationId
  if (!organizationId) return {}

  const idOrSlug = isWorkbenchApp(cliConfig.app)
    ? (cliConfig.deployment?.appId ?? cliConfig.app.slug)
    : undefined

  const [organizationName, version] = await Promise.all([
    fetchOrganizationName(organizationId),
    idOrSlug ? settle(fetchVersion(organizationId, idOrSlug)) : undefined,
  ])

  return {organizationName, version}
}

export async function waitForDevServerDetails(
  details: Promise<DevServerDetails>,
): Promise<DevServerDetails> {
  const settled = await Promise.race([
    details,
    new Promise<typeof PENDING>((resolve) => setImmediate(resolve, PENDING)),
  ])
  if (settled !== PENDING) return settled

  const spin = spinner('Loading organization and deployment details').start()
  const timeout = new Promise<DevServerDetails>((resolve) => {
    setTimeout(() => resolve({}), DETAILS_TIMEOUT_MS).unref()
  })
  const result = await Promise.race([details, timeout])
  spin.stop()

  return result
}

async function fetchVersion(organizationId: string, idOrSlug: string): Promise<string> {
  const application = await getOrganizationApplication(organizationId, idOrSlug)
  const active = application?.activeDeployment
  if (!active) return `local preview ${styleText('dim', '· not deployed')}`

  const deployedBy = await settle(
    request<{displayName: string}>(`/users/${active.deployedBy}`).then((user) => user.displayName),
  )
  const date = new Date(active.createdAt).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const by = deployedBy ? ` by ${deployedBy}` : ''

  return `local preview ${styleText('dim', `· deployed ${date}${by}`)}`
}
