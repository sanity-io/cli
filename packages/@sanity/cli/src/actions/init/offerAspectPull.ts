import {access, mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {confirm, logSymbols, spinner} from '@sanity/cli-core/ux'

import {getAspects, type MediaLibrary} from '../../services/mediaLibraries.js'
import {pluralize} from '../../util/pluralize.js'
import {replaceFieldEntries} from '../media/cliConfigFields.js'
import {
  convertAspectDocuments,
  formatFieldEntries,
  type PullableAspectDocument,
} from '../media/pullAspects.js'

/** Where the scaffold keeps field modules — the template's `fields[*].src` dir. */
const FIELDS_DIR = path.join('src', 'fields')

/**
 * Offer to seed the freshly scaffolded config app from the organization's
 * existing aspects. Deploying the config mirrors it into the library —
 * stored aspects the config does not declare get deleted — so a scaffold
 * that starts from the example fields instead of the real ones is a loaded
 * footgun. Pulling at init time defuses it while we are still interactive
 * and authenticated.
 *
 * Only offered when the organization has exactly one active library (no
 * prompt-stacking during init); lookups and conversion errors degrade to a
 * silent skip — the scaffold is complete without this, and
 * `sanity media pull-aspects` covers it later.
 *
 * @returns `true` when the example fields were replaced by pulled modules.
 */
export async function offerAspectPull({
  library,
  output,
  outputPath,
}: {
  library: MediaLibrary
  output: Output
  outputPath: string
}): Promise<boolean> {
  const spin = spinner('Checking the media library for existing aspects').start()
  let documents: PullableAspectDocument[]
  try {
    documents = await getAspects(library.id)
  } catch {
    return false
  } finally {
    spin.stop()
  }
  if (documents.length === 0) return false

  const {modules, skipped} = convertAspectDocuments(documents)
  if (modules.length === 0) return false

  const shouldPull = await confirm({
    default: true,
    message:
      `Media library ${library.id} already defines ${modules.length} ${pluralize('aspect', modules.length)}. ` +
      'Generate field modules from them (replaces the example fields)?',
  })
  if (!shouldPull) return false

  if (skipped.length > 0) {
    for (const aspect of skipped) {
      const errors = aspect.validationErrors.flatMap((group) => group.map(({message}) => message))
      output.warn(`Skipped aspect ${aspect.id}: ${[...aspect.reasons, ...errors].join('; ')}`)
    }
  }

  // The example modules make way for the real ones: entries are replaced
  // wholesale in the config, so files left behind would just be orphans.
  const fieldsDir = path.join(outputPath, FIELDS_DIR)
  await rm(fieldsDir, {force: true, recursive: true})
  await mkdir(fieldsDir, {recursive: true})
  for (const module of modules) {
    await writeFile(path.join(fieldsDir, module.filename), module.source)
  }

  const configPath = await findCliConfig(outputPath)
  const entryLines = formatFieldEntries(modules, FIELDS_DIR.replaceAll(path.sep, '/')).split('\n')

  // Modules are already on disk at this point; if the declarations cannot be
  // written, surface them to paste — leaving them undeclared makes deploy
  // delete the stored originals.
  const bail = (reason: string): true => {
    output.warn(`Could not declare the generated fields automatically: ${reason}`)
    output.log('Replace the `fields` entries in sanity.cli.ts with:')
    output.log('')
    output.log(entryLines.map((line) => `  ${line}`).join('\n'))
    return true
  }

  if (!configPath) return bail('no sanity.cli.ts found')
  const result = replaceFieldEntries(await readFile(configPath, 'utf8'), entryLines)
  if (!result.ok) return bail(result.reason)

  await writeFile(configPath, result.updated)
  output.log(
    `${logSymbols.success} Generated ${modules.length} field ${pluralize('module', modules.length)} from your media library and declared them in sanity.cli.ts`,
  )
  return true
}

/** The scaffolded CLI config path (`sanity.cli.ts` or `.js`), if present. */
async function findCliConfig(outputPath: string): Promise<string | undefined> {
  for (const filename of ['sanity.cli.ts', 'sanity.cli.js']) {
    const candidate = path.join(outputPath, filename)
    const exists = await access(candidate).then(
      () => true,
      () => false,
    )
    if (exists) return candidate
  }
  return undefined
}
