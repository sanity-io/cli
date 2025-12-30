import {existsSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {execa} from 'execa'

import {type Editor} from '../../services/mcp.js'

/**
 * Detect which AI editors are installed on the user's machine
 * Checks for Cursor, VS Code, and Claude Code
 *
 * @returns Array of detected editors with their config paths
 */
export async function detectAvailableEditors(): Promise<Editor[]> {
  const editors: Editor[] = []
  const homeDir = os.homedir()

  // Cursor detection
  const cursorDir = path.join(homeDir, '.cursor')
  if (existsSync(cursorDir)) {
    editors.push({
      configKey: 'mcpServers',
      configPath: path.join(cursorDir, 'mcp.json'),
      name: 'Cursor',
    })
  }

  // VS Code detection (platform-specific)
  let vscodeConfigDir: string | null = null
  switch (process.platform) {
    case 'darwin': {
      vscodeConfigDir = path.join(homeDir, 'Library/Application Support/Code/User')
      break
    }
    case 'win32': {
      // APPDATA is required on Windows for VS Code config path
      if (process.env.APPDATA) {
        vscodeConfigDir = path.join(process.env.APPDATA, 'Code/User')
      }
      break
    }
    default: {
      // linux
      vscodeConfigDir = path.join(homeDir, '.config/Code/User')
    }
  }

  if (vscodeConfigDir && existsSync(vscodeConfigDir)) {
    editors.push({
      configKey: 'servers',
      configPath: path.join(vscodeConfigDir, 'mcp.json'),
      name: 'VS Code',
    })
  }

  // Claude Code detection
  try {
    await execa('claude', ['--version'], {stdio: 'pipe', timeout: 5000})
    editors.push({
      configKey: 'mcpServers',
      configPath: path.join(homeDir, '.claude.json'),
      name: 'Claude Code',
    })
  } catch {
    // Not installed or timed out
  }

  return editors
}
