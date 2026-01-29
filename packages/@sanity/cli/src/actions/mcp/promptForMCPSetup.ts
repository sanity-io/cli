import {checkbox} from '@sanity/cli-core/ux'

import {type Editor} from './types.js'

/**
 * Prompt user to select which editors to configure
 * Shows existing config status - unconfigured editors are pre-selected,
 * configured editors show "(already installed)" and are not pre-selected
 */
export async function promptForMCPSetup(editors: Editor[]): Promise<Editor[] | null> {
  const editorChoices = editors.map((e) => ({
    checked: !e.configured, // Only pre-select if NOT already configured
    name: e.configured ? `${e.name} (already installed)` : e.name,
    value: e.name,
  }))

  const result = await checkbox({
    choices: editorChoices,
    message: 'Configure Sanity MCP server?',
  })

  const selectedNames = result

  // User can deselect all to skip
  if (!selectedNames || selectedNames.length === 0) {
    return null
  }

  return editors.filter((e) => selectedNames.includes(e.name))
}
