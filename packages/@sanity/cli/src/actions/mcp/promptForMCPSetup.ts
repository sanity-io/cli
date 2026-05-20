import {checkbox} from '@sanity/cli-core/ux'

import {type Editor} from './types.js'

function getEditorLabel(editor: Editor): string {
  return editor.name
}

function getEditorDescription(editor: Editor): string {
  if (!editor.configured) {
    return 'Not configured'
  }
  return 'Configured'
}

/**
 * Prompt user to select where MCP should be configured.
 *
 * The checked state represents the desired final state. Editors that are
 * already configured start checked; unconfigured editors start unchecked.
 */
export async function promptForMCPSetup(editors: Editor[]): Promise<Editor[]> {
  const editorChoices = editors.map((e) => ({
    checked: e.configured,
    description: getEditorDescription(e),
    name: getEditorLabel(e),
    value: e.name,
  }))

  const selectedNames = await checkbox({
    choices: editorChoices,
    message: 'Where should Sanity MCP be configured?',
  })

  return editors.filter((e) => selectedNames.includes(e.name))
}
