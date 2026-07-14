import {basename, dirname} from 'node:path'
import {createGzip} from 'node:zlib'

import {exitCodes, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {pack} from 'tar-fs'

import {
  type BrettInterface,
  type BrettWorkspace,
  createApplication,
  createDeployment,
} from '../../services/applications.js'

/**
 * Deploy a workbench coreApp through Brett: redeploy when `appId` is set,
 * otherwise create the application at `slug`. Returns the application id for the
 * shell to report.
 * @internal
 */
export async function deployCoreApp(options: {
  appId: string | undefined
  interfaces: readonly BrettInterface[]
  isAutoUpdating: boolean
  isSingleton?: boolean
  organizationId: string
  slug: string
  sourceDir: string
  title: string
  version: string
}): Promise<{applicationId: string}> {
  const {
    appId,
    interfaces,
    isAutoUpdating,
    isSingleton,
    organizationId,
    slug,
    sourceDir,
    title,
    version,
  } = options
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())

  const spin = spinner('Deploying...').start()
  try {
    if (appId) {
      await createDeployment({applicationId: appId, interfaces, isAutoUpdating, tarball, version})
      spin.succeed()
      return {applicationId: appId}
    }

    const {id} = await createApplication({
      interfaces,
      isSingleton,
      organizationId,
      slug,
      tarball,
      title,
      type: 'coreApp',
      version,
    })
    spin.succeed()
    return {applicationId: id}
  } catch (error) {
    spin.clear()
    throw error
  }
}

/**
 * Deploy a workbench studio through Brett: redeploy when `appId` is set,
 * otherwise create the studio at `studioHost`. Returns the application id for
 * the shell to report; a missing `studioHost` on create is a usage error.
 * @internal
 */
export async function deployStudio(options: {
  appId: string | undefined
  interfaces: readonly BrettInterface[]
  isAutoUpdating: boolean
  organizationId: string
  output: Output
  projectId: string | undefined
  sourceDir: string
  studioHost: string | undefined
  title: string
  version: string
  workspaces: readonly BrettWorkspace[]
}): Promise<{applicationId: string}> {
  const {
    appId,
    interfaces,
    isAutoUpdating,
    organizationId,
    output,
    projectId,
    sourceDir,
    studioHost,
    title,
    version,
    workspaces,
  } = options
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())

  const spin = spinner('Deploying to sanity.studio').start()
  try {
    if (appId) {
      await createDeployment({
        applicationId: appId,
        interfaces,
        isAutoUpdating,
        tarball,
        version,
        workspaces,
      })
      spin.succeed()
      return {applicationId: appId}
    }

    if (!studioHost) {
      spin.fail()
      return output.error(
        'No studio hostname configured. Set `studioHost` in sanity.cli.ts to create a studio.',
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    const application = await createApplication({
      interfaces,
      organizationId,
      projectId,
      slug: studioHost,
      tarball,
      title,
      type: 'studio',
      version,
      workspaces,
    })
    spin.succeed()
    return {applicationId: application.id}
  } catch (error) {
    spin.fail()
    throw error
  }
}
