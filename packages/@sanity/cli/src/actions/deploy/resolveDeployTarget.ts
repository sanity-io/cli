import {
  getUserApplication,
  getUserApplications,
  type UserApplication,
} from '../../services/userApplications.js'

/**
 * The read-only outcome of resolving where a deploy would go.
 *
 * - `found` — the deploy targets this existing user application
 * - `would-create` — nothing registered yet; a deploy would create it without prompting
 * - `needs-input` — config doesn't determine a target; a deploy would prompt
 *   (`existing` lists the applications a prompt would offer)
 * - `invalid` — the configured target can never resolve (bad host, unknown appId)
 * - `blocked` — resolution requires config that's missing (projectId/organizationId)
 *
 * Transport errors (network, permissions) throw — they're not verdicts.
 */
type CommonDeployTargetResolution =
  | {application: UserApplication; type: 'found'}
  | {existing: UserApplication[]; type: 'needs-input'}
  | {message: string; reason: 'app-not-found' | 'invalid-host'; type: 'invalid'}
  | {message: string; type: 'blocked'}

export type AppDeployTargetResolution = CommonDeployTargetResolution | {type: 'would-create'}

/**
 * Owns the app deploy-target rules: appId lookup, falling back to listing the
 * organization's applications.
 *
 * @internal
 */
export async function resolveAppDeployTarget(options: {
  appId: string | undefined
  organizationId: string | undefined
}): Promise<AppDeployTargetResolution> {
  const {appId, organizationId} = options

  if (appId) {
    const application = await getUserApplication({appId, isSdkApp: true})
    if (application) {
      return {application, type: 'found'}
    }
    return {
      message: `Cannot find app with app ID ${appId}`,
      reason: 'app-not-found',
      type: 'invalid',
    }
  }

  if (!organizationId) {
    return {message: 'app.organizationId is missing', type: 'blocked'}
  }

  const existing = await getUserApplications({appType: 'coreApp', organizationId})
  if (existing?.length) {
    return {existing, type: 'needs-input'}
  }

  return {type: 'would-create'}
}
