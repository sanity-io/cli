import {checkbox} from '@sanity/cli-core/ux'

import {type Editor} from './types.js'

function getEditorLabel(editor: Editor): string {
  if (editor.configured && editor.authStatus === 'unauthorized') {
    return `${editor.name} (auth expired)`
  }
  if (editor.configured && !editor.existingToken) {
    return `${editor.name} (missing credentials)`
  }
  return editor.name
}

/**
 * Prompt user to select which editors to configure.
 *
 * Expects only actionable editors (unconfigured, or configured with
 * invalid/missing credentials). Annotates entries with auth status.
 */
export async function promptForMCPSetup(editors: Editor[]): Promise<Editor[] | null> {
  const editorChoices = editors.map((e) => ({
    checked: true, // Pre-select all actionable editors
    name: getEditorLabel(e),
    value: e.name,
  }))

  const selectedNames = await checkbox({
    choices: editorChoices,
    message: 'Configure Sanity MCP server?',
  })

  // User can deselect all to skip
  if (!selectedNames || selectedNames.length === 0) {
    return null
  }

  return editors.filter((e) => selectedNames.includes(e.name))
}
