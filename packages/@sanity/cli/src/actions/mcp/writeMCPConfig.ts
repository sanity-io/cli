import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import {applyEdits, modify} from 'jsonc-parser'

import {EDITOR_CONFIGS} from './editorConfigs.js'
import {Editor} from './types.js'

/**
 * Write MCP configuration to editor config file
 * Uses jsonc-parser's modify/applyEdits to preserve comments
 *
 * Note: Config parseability is already validated in detectAvailableEditors()
 */
export async function writeMCPConfig(editor: Editor, token: string): Promise<void> {
  const configPath = editor.configPath
  const {buildServerConfig, configKey} = EDITOR_CONFIGS[editor.name]

  // Read existing content or start with empty object
  let content = '{}'
  if (existsSync(configPath)) {
    const fileContent = await fs.readFile(configPath, 'utf8')
    if (fileContent.trim()) {
      content = fileContent
    }
  }

  // Modify using jsonc-parser - preserves comments
  // Setting a nested path automatically creates intermediate objects
  const edits = modify(content, [configKey, 'Sanity'], buildServerConfig(token), {
    formattingOptions: {insertSpaces: true, tabSize: 2},
  })
  content = applyEdits(content, edits)

  // Ensure parent directory exists and write
  await fs.mkdir(path.dirname(configPath), {recursive: true})
  await fs.writeFile(configPath, content, 'utf8')
}
