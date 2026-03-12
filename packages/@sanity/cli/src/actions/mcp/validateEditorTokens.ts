import {subdebug} from '@sanity/cli-core'

import {validateMCPToken} from '../../services/mcp.js'
import {type AuthStatus, type Editor} from './types.js'

const debug = subdebug('mcp:validateEditorTokens')

/**
 * Validate existing MCP tokens for all configured editors.
 *
 * Collects unique tokens, validates each once against the Sanity API,
 * and sets `authStatus` on each editor that has a token.
 * Editors without a config or token are left unchanged.
 */
export async function validateEditorTokens(editors: Editor[]): Promise<void> {
  // Collect unique tokens and map them to their editors
  const tokenToEditors = new Map<string, Editor[]>()
  for (const editor of editors) {
    if (editor.existingToken) {
      const existing = tokenToEditors.get(editor.existingToken)
      if (existing) {
        existing.push(editor)
      } else {
        tokenToEditors.set(editor.existingToken, [editor])
      }
    }
  }

  if (tokenToEditors.size === 0) {
    debug('No existing tokens to validate')
    return
  }

  debug('Validating %d unique token(s) across %d editor(s)', tokenToEditors.size, editors.length)

  // Validate each unique token once
  for (const [token, tokenEditors] of tokenToEditors) {
    let status: AuthStatus
    try {
      const valid = await validateMCPToken(token)
      status = valid ? 'valid' : 'unauthorized'
    } catch (err) {
      // Network errors, timeouts, or unexpected failures — assume the token
      // is valid rather than falsely marking it as expired. We only mark
      // tokens as unauthorized when the server explicitly says so (401/403).
      debug('Token validation error (assuming valid): %s', err)
      status = 'valid'
    }

    debug(
      'Token ending ...%s is %s (used by %s)',
      token.slice(-4),
      status,
      tokenEditors.map((e) => e.name).join(', '),
    )

    // Apply status to all editors sharing this token
    for (const editor of tokenEditors) {
      editor.authStatus = status
    }
  }
}
