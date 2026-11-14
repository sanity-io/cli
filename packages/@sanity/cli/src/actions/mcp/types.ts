import {type EditorName} from './editorConfigs.js'

export interface Editor {
  configPath: string
  /** Whether Sanity MCP is already configured for this editor */
  configured: boolean
  name: EditorName

  /**
   * Whether the existing Sanity MCP config still holds a login token written by
   * an older CLI version. Such configs are replaced with the OAuth config.
   */
  hasLegacyToken?: boolean
}
