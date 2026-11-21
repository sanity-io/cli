import {type TypeGenConfig} from '@sanity/codegen'
import {isValiError, parse} from 'valibot'

import {loadCodegen} from './loadCodegen.js'

/**
 * Applies `@sanity/codegen` schema defaults to a partial typegen config.
 *
 * `@sanity/codegen` 8.1.0 moved `configDefinition` from Zod to Valibot, so the
 * schema is no longer callable as `configDefinition.parse()`.
 */
export async function parseTypegenConfig(input: unknown = {}): Promise<TypeGenConfig> {
  const {configDefinition} = await loadCodegen()
  try {
    return parse(configDefinition, input)
  } catch (error) {
    if (isValiError(error)) {
      throw new TypeError(
        `Error in typegen config\n ${error.issues.map((issue) => issue.message).join('\n')}`,
        {cause: error},
      )
    }
    throw error
  }
}
