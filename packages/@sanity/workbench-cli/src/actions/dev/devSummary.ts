import {spinner} from '@sanity/cli-core/ux'

import {getOrganizationApplication} from '../../services/applications.js'
import {getOrganization} from '../../services/organizations.js'
import {getUser} from '../../services/users.js'
import {SUMMARY_LOOKUP_TIMEOUT_MS} from '../summary.js'

const PENDING = Symbol('pending')

export interface DevSummaryDetails {
  /** `null` when the app has no active deployment, `undefined` when the lookup failed or was skipped. */
  deployment?: {createdAt: string; deployedBy: string | null} | null
  organizationName?: string | null
}

export async function fetchDevSummaryDetails({
  idOrSlug,
  organizationId,
}: {
  idOrSlug?: string
  organizationId?: string
}): Promise<DevSummaryDetails> {
  if (!organizationId) return {}

  const signal = AbortSignal.timeout(SUMMARY_LOOKUP_TIMEOUT_MS)
  const organizationName = getOrganization(organizationId, signal)
    .then((org) => org.name)
    .catch(() => null)

  if (!idOrSlug) {
    return {organizationName: await organizationName}
  }

  let deployment: DevSummaryDetails['deployment']

  try {
    const application = await getOrganizationApplication(organizationId, idOrSlug, signal)
    const active = application?.activeDeployment

    if (active) {
      const deployedBy = await getUser(active.deployedBy, signal)
        .then((user) => user.displayName)
        .catch(() => null)
      deployment = {createdAt: active.createdAt, deployedBy}
    } else {
      deployment = null
    }
  } catch {
    // Left undefined: a failed lookup must not read as "not deployed".
  }

  return {deployment, organizationName: await organizationName}
}

export async function waitForDevSummaryDetails(
  details: Promise<DevSummaryDetails>,
): Promise<DevSummaryDetails> {
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
