import {checkbox} from '@sanity/cli-core/ux'

import {EDITOR_CONFIGS} from './editorConfigs.js'
import {type Editor} from './types.js'

function getEditorLabel(editor: Editor): string {
  if (editor.configured && editor.authStatus === 'unauthorized') {
    return `${editor.name} (auth expired)`
  }
  if (editor.configured && !editor.existingToken && !EDITOR_CONFIGS[editor.name].oauthOnly) {
    return `${editor.name} (missing credentials)`
  }
  return editor.name
}

function getEditorDescription(editor: Editor): string {
  if (!editor.configured) {
    return 'Not configured'
  }
  if (editor.authStatus === 'unauthorized') {
    return 'Auth expired. Keep selected to refresh the configuration.'
  }
  if (!editor.existingToken && !EDITOR_CONFIGS[editor.name].oauthOnly) {
    return 'Missing credentials. Keep selected to update the configuration.'
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
