import {type Output} from '@sanity/cli-core'
import {chalk} from '@sanity/cli-core/ux'

import {extractManifestSafe} from '../../manifest/extractManifest.js'
import {FlagValidationError} from './schemaStoreValidation.js'

export async function ensureManifestExtractSatisfied(args: {
  extractManifest: boolean
  manifestDir: string
  manifestSafe?: boolean
  output: Output
  schemaRequired?: boolean
  workDir: string
}) {
  const {extractManifest, manifestDir, manifestSafe, output, schemaRequired, workDir} = args
  if (!extractManifest) {
    return true
  }
  try {
    // a successful manifest extract will write a new manifest file, which manifestReader will then read from disk
    const error = await extractManifestSafe({
      flags: {json: false, path: manifestDir},
      output,
      workDir,
    })

    if (!manifestSafe && error) {
      throw error
    }

    return true
  } catch (err) {
    if (schemaRequired || err instanceof FlagValidationError) {
      throw err
    } else {
      output.log(chalk.gray(`↳ Failed to extract manifest:\n  ${err.message}`))
      return false
    }
  }
}
