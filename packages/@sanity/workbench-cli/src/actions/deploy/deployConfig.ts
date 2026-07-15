import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {type Output, subdebug} from '@sanity/cli-core'
import {pack} from 'tar-fs'

import {getWorkbenchUrl} from '../../services/applications.js'
import {createConfig, resolveSingletonInstallationId} from '../../services/installations.js'
import {summarizeExposeGroup} from './buildExposes.js'

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
export function summarizeConfig(config: {
  appType: string
  fields: {name: string; src: string; title: string}[]
}): string {
  switch (config.appType) {
    case 'media-library': {
      return summarizeExposeGroup('Media library fields', config.fields)
    }
    default: {
      throw new Error(`Cannot create config for unknown app type: ${config.appType}`)
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
  organizationId: string
  output: Output
  sourceDir: string
  version: string
}): Promise<void> {
  const {appType, installationId, organizationId, output, sourceDir, version} = options
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())
  await createConfig(installationId, {tarball, version})

  debug('Deployed config for app type: %s', appType)
  const url = getWorkbenchUrl(organizationId)
  output.log(`\n🚀 ${styleText('bold', 'Success!')} Config deployed to ${styleText('cyan', url)}`)
}
