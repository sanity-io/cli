import {type EditorName} from './editorConfigs.js'

/** Auth credential status for a configured editor */
export type AuthStatus = 'unauthorized' | 'valid'

export interface Editor {
  configPath: string
  /** Whether Sanity MCP is already configured for this editor */
  configured: boolean
  name: EditorName

  /**
   * Auth status of the existing token. Only set for editors that have
   * a Sanity MCP config with a token that has been validated against the API.
   */
  authStatus?: AuthStatus
  /** The existing auth token found in the editor config, if any */
  existingToken?: string
}
