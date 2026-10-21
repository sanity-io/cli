import path from 'node:path'

import {type CliConfig, type Output} from '@sanity/cli-core'
import {
  createCoreApp,
  getApplication,
  getWorkbench,
  listApplications,
} from '@sanity/workbench-cli/deploy'

import {createUserApplication, getUserApplication} from '../../services/userApplications.js'
import {generateAppSlug} from '../deploy/createUserApplication.js'
import {findUserApplication} from '../deploy/findUserApplication.js'

export async function resolveFunctionApp({
  allowCreateApp,
  appId,
  cliConfig,
  dryRun,
  organizationId,
  output,
  selectExisting,
  title,
  unattended,
  workDir,
}: {
  allowCreateApp: boolean
  appId: string | undefined
  cliConfig: CliConfig
  dryRun: boolean
  organizationId: string
  output: Output
  selectExisting: boolean
  title: string | undefined
  unattended: boolean
  workDir: string
}): Promise<{created: boolean; id: string} | null> {
  const workbench = getWorkbench(cliConfig)
  const resolvedTitle =
    title?.trim() || cliConfig.app?.title?.trim() || workbench?.slug || path.basename(workDir)

  function checkApplication(app: {id: string; organizationId: string | null; type: string}) {
    if (app.organizationId !== organizationId || app.type !== 'coreApp') {
      throw new Error(
        `Application "${app.id}" is not an SDK app in organization "${organizationId}". Check app.organizationId and deployment.appId in sanity.cli.ts.`,
      )
    }
    return {created: false, id: app.id}
  }

  if (appId) {
    const app = workbench
      ? await getApplication(appId)
      : await getUserApplication({appId, isSdkApp: true})
    if (!app) {
      throw new Error(
        `Application "${appId}" was not found. Check deployment.appId in sanity.cli.ts and the saved app ID in .sanity/app-functions.json.`,
      )
    }
    return checkApplication(app)
  }

  if (workbench) {
    workbench.assertDeployable()
    const existing = (await listApplications(organizationId)).find(
      (app) => app.slug === workbench.slug,
    )
    if (existing) {
      throw new Error(
        `App address "${workbench.slug}" is already registered as "${existing.id}". Set deployment.appId to use that app, or choose a different slug.`,
      )
    }
    if (!allowCreateApp) {
      throw new Error(
        'A first deploy cannot skip the build. Drop --no-build so the new application ID is included in the bundle.',
      )
    }
    if (dryRun) return null
    const {application} = await createCoreApp({
      isSingleton: workbench.isSingleton,
      name: workbench.name,
      organizationId,
      slug: workbench.slug,
      title: resolvedTitle,
      visibility: workbench.visibility,
    })
    return {created: true, id: application.id}
  }

  if (dryRun) return null
  if (selectExisting) {
    const existing = await findUserApplication({
      cliConfig,
      organizationId,
      output,
      title: resolvedTitle,
      unattended,
    })
    if (existing) return checkApplication(existing)
  }
  const app = await createUserApplication({
    appType: 'coreApp',
    body: {
      appHost: generateAppSlug(),
      dashboardStatus: cliConfig.app?.visibility,
      title: resolvedTitle,
      type: 'coreApp',
      urlType: 'internal',
    },
    organizationId,
  })
  return {created: true, id: app.id}
}
