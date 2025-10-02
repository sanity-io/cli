import {input} from '@inquirer/prompts'

import {validateDatasetName} from '../actions/dataset/validateDatasetName.js'

export function promptForDatasetName(
  options: {default?: string; message?: string} = {},
): Promise<string> {
  return input({
    default: options.default,
    message: options.message || 'Dataset name:',
    validate: (name) => {
      const err = validateDatasetName(name)
      if (err) {
        return err
      }

      return true
    },
  })
}
