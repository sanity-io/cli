import {getApplication} from '@sanity/workbench-cli/deploy'

import {
  getUserApplication,
  getUserApplications,
  type UserApplication,
  type UserApplicationResolved,
} from '../../services/userApplications.js'
import {APP_ID_NOT_FOUND_IN_ORGANIZATION} from '../../util/errorMessages.js'
import {normalizeUrl, validateUrl} from './urlUtils.js'

/** The application fields a deploy-target verdict carries for reporting. */
interface DeployTargetApp {
  appHost: string
  id: string
  title: string | null
}

/** A coreApp verdict also carries the organization, for the dashboard URL. */
interface DeployTargetCoreApp extends DeployTargetApp {
  organizationId: string
}

/**
 * The read-only outcome of resolving where a deploy would go.
 *
 * - `found` — the deploy targets this existing application
 * - `would-create` — nothing registered yet; a deploy would create it without prompting
 * - `needs-input` — config doesn't determine a target; a deploy would prompt
 *   (`existing` lists the applications a prompt would offer)
 * - `invalid` — the configured target can never resolve (bad host, unknown appId)
 * - `blocked` — resolution requires config that's missing (projectId/organizationId)
 *
 * Transport errors (network, permissions) throw — they're not verdicts.
 *
 * The user-applications resolvers carry the full {@link UserApplication} (the
 * real deploy needs it); the workbench resolvers and the report only need
 * {@link DeployTargetApp}, so `App` defaults to that widened shape.
 */
type CommonDeployTargetResolution<App = DeployTargetApp> =
  | {application: App; type: 'found'}
  | {existing: App[]; type: 'needs-input'}
  | {message: string; reason: 'app-not-found' | 'invalid-host'; type: 'invalid'}
  | {message: string; type: 'blocked'}

export type StudioDeployTargetResolution<App = DeployTargetApp> =
  | CommonDeployTargetResolution<App>
  | {appHost: string; type: 'would-create'}

export type AppDeployTargetResolution<App = DeployTargetCoreApp> =
  | CommonDeployTargetResolution<App>
  | {type: 'would-create'}

/**
 * Owns the studio deploy-target rules: the --url flag over studioHost config,
 * appId over appHost precedence, external URL normalization and validation.
 * Both the real deploy and the dry run consume these verdicts.
 *
 * @internal
 */
export async function resolveStudioDeployTarget(options: {
  appId: string | undefined
  isExternal: boolean
  projectId: string | undefined
  studioHost: string | undefined
  urlFlag: string | undefined
}): Promise<StudioDeployTargetResolution<UserApplication>> {
  const {appId, isExternal, projectId, studioHost, urlFlag} = options

  // appId wins over host config (and undeploy resolves it the same way): a
  // configured appId deploys even when studioHost is stale or invalid, so it's
  // resolved before any host validation.
  if (appId) {
    if (!projectId) {
      return {message: 'api.projectId is missing', type: 'blocked'}
    }
    const application = await getUserApplication({appId, isSdkApp: false, projectId})
    if (application) {
      return {application, type: 'found'}
    }
    return {
      message: `Cannot find app with app ID ${appId}`,
      reason: 'app-not-found',
      type: 'invalid',
    }
  }

  const {error: hostError, host: resolvedHost} = resolveAppHost({
    isExternal,
    studioHost,
    url: urlFlag,
  })
  if (hostError) {
    return {message: hostError, reason: 'invalid-host', type: 'invalid'}
  }

  // A host from config hasn't passed through the --url validation yet
  let appHost = resolvedHost
  if (appHost && isExternal) {
    appHost = normalizeUrl(appHost)
    const validation = validateUrl(appHost)
    if (validation !== true) {
      return {message: validation, reason: 'invalid-host', type: 'invalid'}
    }
  }

  if (appHost) {
    if (!projectId) {
      return {message: 'api.projectId is missing', type: 'blocked'}
    }
    const application = await getUserApplication({appHost, isSdkApp: false, projectId})
    if (application) {
      return {application, type: 'found'}
    }
    return {appHost, type: 'would-create'}
  }

  // Neither appId nor host configured — a deploy would prompt.
  // Without a project there is nothing to list; a deploy would still prompt.
  const existing = projectId ? await listStudioApplications(projectId, isExternal) : []
  return {existing, type: 'needs-input'}
}

/**
 * Owns the app deploy-target rules: appId lookup, falling back to listing the
 * organization's applications. Both the real deploy and the dry run consume
 * these verdicts.
 *
 * @internal
 */
export async function resolveAppDeployTarget(options: {
  appId: string | undefined
  organizationId: string | undefined
}): Promise<AppDeployTargetResolution<UserApplicationResolved>> {
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

/**
 * The dry-run counterpart to a workbench app's create-on-deploy: a configured
 * `appId` is looked up read-only, otherwise a coreApp would be created.
 * @internal
 */
export async function resolveWorkbenchApp({
  appId,
}: {
  appId: string | undefined
}): Promise<AppDeployTargetResolution> {
  return appId ? resolveAppById(appId) : {type: 'would-create'}
}

/**
 * The studio counterpart to {@link resolveWorkbenchApp}: a configured
 * `studioHost` would create that hostname, and without one a deploy would prompt.
 *
 * @internal
 */
export async function resolveWorkbenchStudio({
  appId,
  studioHost,
}: {
  appId: string | undefined
  studioHost: string | undefined
}): Promise<StudioDeployTargetResolution> {
  if (appId) return resolveAppById(appId)
  if (studioHost) return {appHost: studioHost, type: 'would-create'}
  return {existing: [], type: 'needs-input'}
}

async function resolveAppById(
  appId: string,
): Promise<CommonDeployTargetResolution<DeployTargetCoreApp>> {
  const application = await getApplication(appId)
  return application
    ? {
        application: {
          appHost: application.slug ?? '',
          id: application.id,
          organizationId: application.organizationId,
          title: application.title,
        },
        type: 'found',
      }
    : {message: APP_ID_NOT_FOUND_IN_ORGANIZATION, reason: 'app-not-found', type: 'invalid'}
}

async function listStudioApplications(
  projectId: string,
  isExternal: boolean,
): Promise<UserApplication[]> {
  const urlType = isExternal ? 'external' : 'internal'
  const applications = await getUserApplications({appType: 'studio', projectId})
  // External deploys should only see external studios and vice versa
  return applications?.filter((application) => application.urlType === urlType) ?? []
}

function resolveAppHost({
  isExternal,
  studioHost,
  url,
}: {
  isExternal: boolean
  studioHost: string | undefined
  url: string | undefined
}): {error?: string; host?: string} {
  if (!url) {
    return {host: studioHost}
  }

  if (isExternal) {
    const normalized = normalizeUrl(url)
    const validation = validateUrl(normalized)
    if (validation !== true) {
      return {error: validation}
    }
    return {host: normalized}
  }

  // For internal deploys, strip protocol prefix and .sanity.studio suffix if present
  const hostname = url.replace(/^https?:\/\//i, '').replace(/\.sanity\.studio\/?$/i, '')

  // If the result still looks like a URL (contains dots), the user likely meant --external
  if (hostname.includes('.')) {
    return {
      error: `"${hostname}" does not look like a sanity.studio hostname. Did you mean to use --external?`,
    }
  }

  // Validate hostname characters (alphanumeric and hyphens only)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(hostname)) {
    return {
      error: `Invalid studio hostname "${hostname}". Hostnames can only contain letters, numbers, and hyphens.`,
    }
  }

  return {host: hostname}
}
