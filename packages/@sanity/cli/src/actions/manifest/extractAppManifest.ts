import {getCliConfig} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {getErrorMessage} from '../../util/getErrorMessage.js'
import {type DeployFlags} from '../deploy/types.js'
import {type AppManifest} from './types.js'

interface ExtractAppManifestOptions {
  flags: DeployFlags
  workDir: string
}

/**
 *
 * This functions slightly differently from the studio manifest extraction function.
 * We don't need to parse very complicated information like schemas and tools,
 * and we submit the manifest as a multipart form field instead of writing a file.
 */
export async function extractAppManifest(options: ExtractAppManifestOptions): Promise<AppManifest | undefined> {
  const {workDir} = options

  const spin = spinner('Extracting manifest').start()

  try {
    const {app} = await getCliConfig(workDir)
    if (!app) {
      // this is probably a problem for deployment, but not an issue for manifest extraction
      spin.succeed('No app configuration found')
      return undefined
    }
    const manifest: AppManifest = {
      version: '1',
      ...(app.icon ? {icon: app.icon} : {}),
      ...(app.title ? {title: app.title} : {}),
    }

    spin.succeed(`Extracted manifest`)

    return manifest
  } catch (err) {
    const message = getErrorMessage(err)
    spin.fail(message)
    throw err
  }
}

/**
 * App manifests aren't required right now.
 * This function just ensures we're not uploading empty manifests
 * (so we can reduce noise in user-applications)
 */
export function appManifestHasData(manifest?: AppManifest | null): boolean {
  if (!manifest || typeof manifest !== 'object' || Object.keys(manifest).length === 0) {
    return false
  }
  const validAppManifestKeys = ['icon', 'title']
  return validAppManifestKeys.some((key) => !!manifest[key as keyof AppManifest])
}
