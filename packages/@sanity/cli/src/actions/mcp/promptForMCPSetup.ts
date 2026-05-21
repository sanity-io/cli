import {checkbox} from '@sanity/cli-core/ux'

import {type Editor} from './types.js'

function getEditorLabel(editor: Editor): string {
  if (editor.configured && editor.authStatus === 'unauthorized') {
    return `${editor.name} (auth expired)`
  }
  if (editor.configured && !editor.existingToken) {
    return `${editor.name} (missing credentials)`
  }
  if (editor.configured) {
    return `${editor.name} (configured)`
  }
  return editor.name
}

/**
 * Prompt the user to choose which editors should have a Sanity MCP entry.
 *
 * The returned array is the desired final state: editors selected here should
 * end up configured, editors that were previously configured but are not
 * selected here should have their Sanity entry removed.
 */
export async function promptForMCPSetup(editors: Editor[]): Promise<Editor[]> {
  const editorChoices = editors.map((e) => ({
    checked: e.configured,
    name: getEditorLabel(e),
    value: e.name,
  }))

  const selectedNames = await checkbox({
    choices: editorChoices,
    message: 'Configure Sanity MCP server?',
  })

  return editors.filter((e) => selectedNames.includes(e.name))
}
