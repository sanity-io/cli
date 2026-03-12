import {type EditorName} from './editorConfigs.js'

export interface Editor {
  configPath: string
  /** Whether Sanity MCP is already configured for this editor */
  configured: boolean
  /** The existing auth token found in the editor config, if any */
  existingToken?: string
  name: EditorName
}
