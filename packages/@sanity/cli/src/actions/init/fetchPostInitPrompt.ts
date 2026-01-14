import {chalk} from '@sanity/cli-core/ux'

import {getPostInitPrompt} from '../../services/mcp.js'

const DEFAULT_MESSAGE =
  'To set up your project with the MCP server, restart {{editorNames}} and type **"Get started with Sanity"** in the chat.'

/**
 * Applies cyan formatting to text wrapped in **markers**.
 */
export function applyCyanFormatting(text: string): string {
  return text.replaceAll(/\*\*([^*]+)\*\*/g, (_, content) => chalk.cyan(content))
}

/**
 * Interpolates the editor names into the template.
 */
export function interpolateTemplate(template: string, editorNames: string): string {
  return template.replaceAll('{{editorNames}}', editorNames)
}

/**
 * Fetches the post-init MCP prompt from the Journey API and interpolates editor names.
 * Falls back to a hardcoded default if the API call fails, times out, or returns empty.
 * Text wrapped in **markers** will be formatted with cyan color.
 */
export async function fetchPostInitPrompt(editorNames: string): Promise<string> {
  try {
    const data = await getPostInitPrompt()
    const template = data?.message || DEFAULT_MESSAGE
    const interpolated = interpolateTemplate(template, editorNames)
    return applyCyanFormatting(interpolated)
  } catch {
    const interpolated = interpolateTemplate(DEFAULT_MESSAGE, editorNames)
    return applyCyanFormatting(interpolated)
  }
}
