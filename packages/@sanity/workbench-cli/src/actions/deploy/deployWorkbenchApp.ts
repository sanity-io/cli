import {basename, dirname} from 'node:path'
import {createGzip} from 'node:zlib'

import {type AppVisibility} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {pack} from 'tar-fs'

import {
  type BrettInterface,
  type BrettWorkspace,
  createApplication,
  createDeployment,
  updateApplication,
} from '../../services/applications.js'

/**
 * Create a coreApp record (no deployment) and return its id, so the CLI can
 * build with it before shipping the first deployment. First deploy only.
 * @internal
 */
export async function createCoreApp(options: {
  isSingleton?: boolean
  organizationId: string
  slug: string
  title: string
  visibility?: AppVisibility
}): Promise<{applicationId: string}> {
  const spin = spinner('Creating application...').start()
  try {
    const {id} = await createApplication({...options, type: 'coreApp'})
    spin.succeed()
    return {applicationId: id}
  } catch (error) {
    spin.fail()
    throw error
  }
}

/**
 * Create a studio record (no deployment) and return its id.
 * @internal
 */
export async function createStudio(options: {
  organizationId: string
  projectId: string | undefined
  slug: string
  title: string
}): Promise<{applicationId: string}> {
  const spin = spinner('Creating studio...').start()
  try {
    const {id} = await createApplication({...options, type: 'studio'})
    spin.succeed()
    return {applicationId: id}
  } catch (error) {
    spin.fail()
    throw error
  }
}

/**
 * Ship a deployment to an already-created (or `deployment.appId`) application,
 * then sync its mutable metadata (`title`, and `icon` when set) from config.
 * @internal
 */
export async function deployWorkbenchApp(options: {
  applicationId: string
  icon?: string
  interfaces: readonly BrettInterface[]
  isAutoUpdating: boolean
  label?: string
  sourceDir: string
  title: string
  version: string
  workspaces?: readonly BrettWorkspace[]
}): Promise<void> {
  const {
    applicationId,
    icon,
    interfaces,
    isAutoUpdating,
    label = 'Deploying...',
    sourceDir,
    title,
    version,
    workspaces,
  } = options
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())

  const spin = spinner(label).start()
  try {
    await createDeployment({
      applicationId,
      interfaces,
      isAutoUpdating,
      tarball,
      version,
      workspaces,
    })
    await updateApplication(applicationId, {title, ...(icon ? {icon} : {})})
    spin.succeed()
  } catch (error) {
    spin.clear()
    throw error
  }
}
