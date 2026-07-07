import {basename, dirname} from 'node:path'
import {PassThrough} from 'node:stream'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {getGlobalCliClient, type Output, subdebug} from '@sanity/cli-core'
import FormData from 'form-data'
import {pack} from 'tar-fs'

// Brett's app-registry endpoints live behind the experimental `vX` version.
const INSTALLATIONS_API_VERSION = 'vX'

const debug = subdebug('deploy')

interface InstallationListItem {
  id: string

  application?: {slug?: string}
}

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
      throw new Error(`Cannot create installation config for unknown app type: ${options.appType}`)
    }
  }
}

/**
 * A report heading and item list for a config; a media library's `fields` are
 * one of potentially many shapes.
 * @internal
 */
export function summarizeInstallationConfig(config: {
  appType: string
  fields: {name: string; title: string}[]
}): string {
  switch (config.appType) {
    case 'media-library': {
      const items = config.fields.map((field) => `  ${field.title} (${field.name})`).join('\n')
      return `Media library fields:\n${items}`
    }
    default: {
      throw new Error(`Cannot create installation config for unknown app type: ${config.appType}`)
    }
  }
}

/**
 * Upload the built module-federation remote to the installation as its config
 * snapshot. `installationId` is resolved by the caller so `--dry-run` never
 * reaches this mutating step.
 * @internal
 */
export async function deployInstallationConfig(options: {
  appType: string
  installationId: string
  output: Output
  sourceDir: string
  version: string
}): Promise<void> {
  const {appType, installationId, output, sourceDir, version} = options
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())
  const formData = new FormData()
  formData.append('version', version)
  formData.append('tarball', tarball, {
    contentType: 'application/gzip',
    filename: 'installation-config.tar.gz',
  })

  const client = await getGlobalCliClient({
    apiVersion: INSTALLATIONS_API_VERSION,
    requireUser: true,
  })
  await client.request({
    body: formData.pipe(new PassThrough()),
    headers: formData.getHeaders(),
    method: 'POST',
    uri: `/installations/${installationId}/configs`,
  })

  debug('Deployed installation config for app type: %s', appType)
  output.log(`\n🚀 ${styleText('bold', 'Success!')} Installation config deployed`)
}

/** The org's active singleton installation, matched on its slug. */
async function resolveSingletonInstallationId(
  organizationId: string,
  slug: string,
): Promise<string | undefined> {
  const client = await getGlobalCliClient({
    apiVersion: INSTALLATIONS_API_VERSION,
    requireUser: true,
  })
  // `limit=none` returns every installation in one response, no pagination.
  const {data}: {data: InstallationListItem[]} = await client.request({
    query: {limit: 'none', organizationId},
    uri: '/installations',
  })
  return data.find((item) => item.application?.slug === slug)?.id
}
