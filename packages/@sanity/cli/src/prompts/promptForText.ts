import {input} from '@sanity/cli-core/ux'

/**
 * Prompt for a required line of text, trimmed
 */
export async function promptForText(message: string): Promise<string> {
  const value = await input({
    message,
    validate: (input_) => input_.trim().length > 0 || 'Value cannot be empty',
  })
  return value.trim()
}
