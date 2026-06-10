import {checkbox} from '@sanity/cli-core/ux'

import {type Editor} from './types.js'

/** Action to take for an editor in the combined MCP + skills setup prompt. */
export type EditorAction = 'mcp-and-skill' | 'mcp-only' | 'skill-only'

export interface EditorChoice {
  action: EditorAction
  editor: Editor
}

function getEditorLabel(choice: EditorChoice): string {
  const {action, editor} = choice
  if (action === 'skill-only') {
    return `${editor.name} (skills only — MCP already configured)`
  }
  if (editor.configured && editor.authStatus === 'unauthorized') {
    return `${editor.name} (auth expired)`
  }
  if (editor.configured && !editor.existingToken) {
    return `${editor.name} (missing credentials)`
  }
  return editor.name
}

interface PromptOptions {
  choices: EditorChoice[]
  message: string
}

/**
 * Prompt the user to select editors for MCP / skills setup. The caller is
 * responsible for classifying editors into actions (see `EditorAction`) and
 * for choosing an appropriate prompt message.
 *
 * Returns the subset of `choices` the user kept, or `null` when the user
 * deselected everything.
 */
export async function promptForMCPSetup({
  choices,
  message,
}: PromptOptions): Promise<EditorChoice[] | null> {
  const editorChoices = choices.map((choice) => ({
    checked: true,
    name: getEditorLabel(choice),
    value: choice.editor.name,
  }))

  const selectedNames = await checkbox({
    choices: editorChoices,
    message,
  })

  if (!selectedNames || selectedNames.length === 0) {
    return null
  }

  return choices.filter((c) => selectedNames.includes(c.editor.name))
}
