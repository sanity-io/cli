import {basename, dirname} from 'node:path'
import {createGzip} from 'node:zlib'

import {subdebug} from '@sanity/cli-core'
import {c as createTar} from 'tar'

import {type WorkbenchConfigValue} from '../../contract.js'
import {createConfig, resolveSingletonInstallationId} from '../../services/installations.js'
import {summarizeGroup} from './summarizeInterfaces.js'

const debug = subdebug('deploy')

/**
 * The org's active installation for an app type, or `undefined` when none is
 * installed. Read-only, so `--dry-run` can report deployability.
 * @internal
 */
export async function resolveInstallationId(options: {
  appType: string
  organizationId: string
}): Promise<string | undefined> {
  switch (options.appType) {
    case 'media-library': {
      return resolveSingletonInstallationId(options.organizationId, 'media-library')
    }
    default: {
      throw new Error(`Cannot create config for unknown app type: ${options.appType}`)
    }
  }
}

/**
 * A report heading and item list for a config; a media library's `fields` are
 * one of potentially many shapes.
 * @internal
 */
export function summarizeConfig(config: WorkbenchConfigValue): string {
  const {appType} = config

  switch (appType) {
    case 'dashboard': {
      return `Dashboard configuration: ${config.src}`
    }
    case 'media-library': {
      return summarizeGroup('Media library fields', config.fields)
    }
    default: {
      appType satisfies never
      throw new Error(`Cannot summarize unknown app type: ${appType as string}`)
    }
  }
}

/**
 * Upload the built module-federation remote to the installation as its config
 * snapshot. `installationId` is resolved by the caller so `--dry-run` never
 * reaches this mutating step.
 * @internal
 */
export async function deployConfig(options: {
  appType: string
  installationId: string
  sourceDir: string
  version: string
}): Promise<void> {
  const {appType, installationId, sourceDir, version} = options
  const tarball = createTar({cwd: dirname(sourceDir)}, [basename(sourceDir)]).pipe(createGzip())
  await createConfig(installationId, {tarball, version})

  debug('Deployed config for app type: %s', appType)
}
