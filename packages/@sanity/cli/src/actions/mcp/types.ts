import {type EditorName} from './editorConfigs.js'

export interface Editor {
  configPath: string
  /** Whether Sanity MCP is already configured for this editor */
  configured: boolean
  name: EditorName

  /**
   * Whether the existing Sanity MCP config holds a token: a login token saved
   * by an older CLI version, or an API token the user added by hand. Such
   * configs are replaced with the OAuth config only when the user is asked.
   */
  hasLegacyToken?: boolean
}
