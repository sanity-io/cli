import fs from 'node:fs/promises'

import {exit} from '@oclif/core/errors'

/**
 * Gets the configured editor for the current platform
 */
export function getEditor(): {args: string[]; bin: string} {
  const defaultEditor = process.platform.startsWith('win') ? 'notepad' : 'vim'

  const editor = process.env.VISUAL || process.env.EDITOR || defaultEditor
  const args = editor.split(/\s+/)
  const bin = args.shift() || ''
  return {args, bin}
}

/**
 * Registers a cleanup handler for SIGINT that removes the temporary file
 */
export function registerUnlinkOnSigInt(tmpFile: string): void {
  const cleanup = async () => {
    await fs.unlink(tmpFile).catch(() => {})

    exit(130)
  }

  // Use 'once' instead of 'on' to prevent memory leaks
  process.once('SIGINT', cleanup)
}
