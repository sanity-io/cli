import type {CliPrompter} from '../../types.js'
import {validateDatasetName} from './validateDatasetName.js'

export function promptForDatasetName(
  prompt: CliPrompter,
  options: {message?: string; default?: string} = {},
): Promise<string> {
  return prompt.single({
    type: 'input',
    message: 'Dataset name:',
    validate: (name) => {
      const err = validateDatasetName(name)
      if (err) {
        return err
      }

      return true
    },
    ...options,
  })
}
