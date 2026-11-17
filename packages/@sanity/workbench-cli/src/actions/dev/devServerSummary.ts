import {type CliConfig} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {isWorkbenchApp} from '../../defineApp.js'
import {getOrganizationApplication} from '../../services/applications.js'
import {getOrganization} from '../../services/organizations.js'
import {getUser} from '../../services/users.js'

const DETAILS_TIMEOUT_MS = 3000
const PENDING = Symbol('pending')

export interface DevServerDetails {
  /** `null` when the app has no active deployment, `undefined` when the lookup failed or was skipped. */
  deployment?: {createdAt: string; deployedBy: string | null} | null
  organizationName?: string | null
}

export async function fetchDevServerDetails(cliConfig: CliConfig): Promise<DevServerDetails> {
  const organizationId = cliConfig.app?.organizationId
  if (!organizationId) return {}

  const idOrSlug = isWorkbenchApp(cliConfig.app)
    ? (cliConfig.deployment?.appId ?? cliConfig.app.slug)
    : undefined
  const signal = AbortSignal.timeout(DETAILS_TIMEOUT_MS)

  const [organizationName, deployment] = await Promise.all([
    getOrganization(organizationId, signal).then(
      (org) => org.name,
      () => null,
    ),
    idOrSlug
      ? getOrganizationApplication(organizationId, idOrSlug, signal).then(
          async (application) => {
            const active = application?.activeDeployment
            if (!active) return null

            const deployedBy = await getUser(active.deployedBy, signal).then(
              (user) => user.displayName,
              () => null,
            )

            return {createdAt: active.createdAt, deployedBy}
          },
          // eslint-disable-next-line unicorn/no-useless-undefined
          () => undefined,
        )
      : undefined,
  ])

  return {deployment, organizationName}
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
  const result = await details
  spin.stop()

  return result
}
