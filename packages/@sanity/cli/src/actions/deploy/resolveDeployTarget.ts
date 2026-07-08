import {
  type AppDeployTargetResolution,
  type StudioDeployTargetResolution,
} from '@sanity/cli-core/deploy'

import {
  getUserApplication,
  getUserApplications,
  type UserApplication,
  type UserApplicationResolved,
} from '../../services/userApplications.js'
import {normalizeUrl, validateUrl} from './urlUtils.js'

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
