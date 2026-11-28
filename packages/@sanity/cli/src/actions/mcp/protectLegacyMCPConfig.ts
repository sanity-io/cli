import {constants} from 'node:fs'
import fs from 'node:fs/promises'

import {type ParseError, parse as parseJsonc} from 'jsonc-parser'
import {parse as parseToml} from 'smol-toml'

import {EDITOR_CONFIGS, hasLegacyToken} from './editorConfigs.js'
import {type Editor} from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Restrict a retained token config without replacing its contents or inode. */
export async function protectLegacyMCPConfig(editor: Editor): Promise<boolean> {
  const currentUid = process.getuid?.()
  if (process.platform === 'win32' || currentUid === undefined || !editor.hasLegacyToken) {
    return false
  }

  // Non-blocking open lets us reject a FIFO without waiting for another process.
  const file = await fs.open(editor.configPath, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.uid !== currentUid) {
      throw new Error(
        'Saved-token MCP configuration must be a regular file owned by the current user',
      )
    }
    if ((stat.mode & 0o077) === 0) return false

    // Recheck the opened file: detection metadata may be stale.
    const content = await file.readFile('utf8')
    const {configKey, format} = EDITOR_CONFIGS[editor.name]
    let config: unknown
    try {
      if (format === 'toml') {
        config = parseToml(content)
      } else {
        const errors: ParseError[] = []
        config = parseJsonc(content, errors, {allowTrailingComma: true})
        if (errors.length > 0) throw new Error('Invalid JSONC')
      }
    } catch {
      // Parser diagnostics can include configuration values. Do not log them.
      throw new Error('Could not parse the saved-token MCP configuration')
    }
    if (!isRecord(config)) return false
    const servers = config[configKey]
    if (!isRecord(servers) || !isRecord(servers.Sanity) || !hasLegacyToken(servers.Sanity)) {
      return false
    }

    // Keep the observed owner bits without replacing the inode or rewriting the token.
    await file.chmod(stat.mode & 0o700)
    if (((await file.stat()).mode & 0o077) !== 0) {
      throw new Error('Filesystem did not restrict access to the saved-token MCP configuration')
    }
    return true
  } finally {
    await file.close()
  }
}
