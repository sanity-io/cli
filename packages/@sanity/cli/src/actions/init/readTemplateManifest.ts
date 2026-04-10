import {readFile, unlink} from 'node:fs/promises'
import {join} from 'node:path'

import {subdebug} from '@sanity/cli-core'

import {TEMPLATE_MANIFEST_FILENAME} from './constants.js'
import {type TemplateManifest, templateManifestSchema} from './types.js'

const debug = subdebug('init:readTemplateManifest')

/**
 * Reads `sanity-template.json` from the bootstrapped project directory (`outputPath`) when present.
 * Returns `null` if the file is missing, cannot be parsed as JSON, or does not match the manifest schema.
 * Never throws.
 */
export async function readTemplateManifest(outputPath: string): Promise<TemplateManifest | null> {
  const manifestPath = join(outputPath, TEMPLATE_MANIFEST_FILENAME)
  try {
    const content = await readFile(manifestPath, 'utf8')
    const json: unknown = JSON.parse(content)
    const parsed = templateManifestSchema.safeParse(json)

    if (!parsed.success) {
      debug('Invalid template manifest at %s', manifestPath)
      return null
    }

    return parsed.data
  } catch (err) {
    debug('Template manifest not used at %s: %s', manifestPath, err)

    return null
  }
}

/**
 * Removes `sanity-template.json` from the project directory after init has read it.
 */
export async function removeTemplateManifestFromOutput(outputPath: string): Promise<void> {
  const manifestPath = join(outputPath, TEMPLATE_MANIFEST_FILENAME)

  try {
    await unlink(manifestPath)
  } catch (err) {
    debug('Could not remove template manifest at %s: %s', manifestPath, err)
  }
}
