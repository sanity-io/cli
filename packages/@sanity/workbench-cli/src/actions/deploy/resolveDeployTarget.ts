// Read-only deploy-target resolution against the applications API — the
// workbench counterpart to @sanity/cli's user-applications resolvers, sharing
// the same verdict vocabulary from @sanity/cli-core/deploy.

import {
  APP_ID_NOT_FOUND_IN_ORGANIZATION,
  type AppDeployTargetResolution,
  type CommonDeployTargetResolution,
  type DeployTargetCoreApp,
  type StudioDeployTargetResolution,
} from '@sanity/cli-core/deploy'

import {getApplication} from './deployWorkbenchApp.js'

/**
 * A configured `appId` is looked up read-only, otherwise a deploy would create
 * the application.
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
