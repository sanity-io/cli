// Wires @sanity/workbench-cli's deploy adapters to the host capabilities only
// this package can provide: builds, config policy, schema upload, and the
// shared success message.

import {type DeployAdapter} from '@sanity/cli-core/deploy'
import {createWorkbenchDeployAdapters} from '@sanity/workbench-cli/deploy'

import {getAppId} from '../../util/appId.js'
import {
  checkAppBuild,
  checkAppIdConfig,
  checkAutoUpdates,
  checkPackageVersion,
  checkStudioBuild,
  externalAppNotSupported,
} from './checks.js'
import {logAppDeployed} from './coreApp.js'
import {generateAppSlug} from './createUserApplication.js'
import {uploadStudioSchema} from './deployStudioSchemasAndManifests.js'

const adapters = createWorkbenchDeployAdapters({
  checkAppBuild,
  checkAppIdConfig,
  checkAutoUpdates,
  checkPackageVersion,
  checkStudioBuild,
  externalAppNotSupported,
  generateAppSlug,
  getAppId,
  logAppDeployed,
  uploadStudioSchema,
})

export const workbenchAppAdapter: DeployAdapter<'coreApp'> = adapters.app
export const workbenchStudioAdapter: DeployAdapter<'studio'> = adapters.studio
