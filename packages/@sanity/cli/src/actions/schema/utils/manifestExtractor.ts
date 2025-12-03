import {type CliCommandContext, type CliOutputter} from '@sanity/cli'
import chalk from 'chalk'

import {extractManifestSafe} from '../../manifest/extractManifest.js'
import {FlagValidationError} from './schemaStoreValidation.js'

export type ManifestExtractor = (manifestDir: string) => Promise<void>

export async function ensureManifestExtractSatisfied(args: {
  extractManifest: boolean
  manifestDir: string
  manifestExtractor: (manifestDir: string) => Promise<void>
  output: CliOutputter
  schemaRequired: boolean
}) {
  const {extractManifest, manifestDir, manifestExtractor, output, schemaRequired} = args
  if (!extractManifest) {
    return true
  }
  try {
    // a successful manifest extract will write a new manifest file, which manifestReader will then read from disk
    await manifestExtractor(manifestDir)
    return true
  } catch (err) {
    if (schemaRequired || err instanceof FlagValidationError) {
      throw err
    } else {
      output.print(chalk.gray(`↳ Failed to extract manifest:\n  ${err.message}`))
      return false
    }
  }
}

export function createManifestExtractor(context: CliCommandContext & {safe?: boolean}) {
  return async (manifestDir: string) => {
    const error = await extractManifestSafe({
      flags: {path: manifestDir},
      output: context.output,
      workDir: context.workDir,
    })
    if (!context.safe && error) {
      throw error
    }
  }
}
