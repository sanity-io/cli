import chalk from 'chalk'

import {type CliCommandContext, type CliOutputter} from '../../../types.js'
import {
  type ExtractManifestFlags,
  extractManifestSafe,
} from '../../manifest/extractManifestAction.js'
import {FlagValidationError} from './schemaStoreValidation.js'

export interface CliCommandArguments<F = Record<string, unknown>> {
  argsWithoutOptions: string[]
  argv: string[]
  extOptions: F
  extraArguments: string[]
  groupOrCommand: string
}

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
    const error = await extractManifestSafe(
      {
        argsWithoutOptions: [],
        argv: [],
        extOptions: {path: manifestDir},
        extraArguments: [],
        groupOrCommand: 'extract',
      } as CliCommandArguments<ExtractManifestFlags>,
      context,
    )
    if (!context.safe && error) {
      throw error
    }
  }
}
