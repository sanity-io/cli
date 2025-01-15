import type {CliPrompter} from '../../../types.js'
import {validateDatasetAliasName} from './validateDatasetAliasName.js'

export function promptForDatasetAliasName(
  prompt: CliPrompter,
  options: {message?: string; default?: string} = {},
): Promise<string> {
  return prompt.single({
    type: 'input',
    message: 'Alias name:',
    validate: (name) => {
      const err = validateDatasetAliasName(name)
      if (err) {
        return err
      }

      return true
    },
    ...options,
  })
}
