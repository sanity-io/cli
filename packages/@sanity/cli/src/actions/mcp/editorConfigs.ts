import {existsSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {execa} from 'execa'

import {MCP_SERVER_URL} from '../../services/mcp.js'

interface EditorConfig {
  buildServerConfig: (token: string) => Record<string, unknown>
  configKey: string
  /** Returns the config file path if editor is detected, null otherwise */
  detect: () => Promise<string | null>
}

const defaultHttpConfig = (token: string) => ({
  headers: {Authorization: `Bearer ${token}`},
  type: 'http',
  url: MCP_SERVER_URL,
})

const homeDir = os.homedir()

/**
 * Centralized editor configuration including detection logic.
 * To add a new editor: add an entry here - EditorName type is derived automatically.
 */
export const EDITOR_CONFIGS = {
  'Claude Code': {
    buildServerConfig: defaultHttpConfig,
    configKey: 'mcpServers',
    detect: async () => {
      try {
        await execa('claude', ['--version'], {stdio: 'pipe', timeout: 5000})
        return path.join(homeDir, '.claude.json')
      } catch {
        return null
      }
    },
  },
  Cursor: {
    buildServerConfig: defaultHttpConfig,
    configKey: 'mcpServers',
    detect: async () => {
      const cursorDir = path.join(homeDir, '.cursor')
      return existsSync(cursorDir) ? path.join(cursorDir, 'mcp.json') : null
    },
  },
  OpenCode: {
    buildServerConfig: (token) => ({
      headers: {Authorization: `Bearer ${token}`},
      type: 'remote',
      url: MCP_SERVER_URL,
    }),
    configKey: 'mcp',
    detect: async () => {
      try {
        await execa('opencode', ['--version'], {stdio: 'pipe', timeout: 5000})
        return path.join(homeDir, '.config/opencode/opencode.json')
      } catch {
        return null
      }
    },
  },
  'VS Code': {
    buildServerConfig: defaultHttpConfig,
    configKey: 'servers',
    detect: async () => {
      let configDir: string | null = null
      switch (process.platform) {
        case 'darwin': {
          configDir = path.join(homeDir, 'Library/Application Support/Code/User')
          break
        }
        case 'win32': {
          if (process.env.APPDATA) {
            configDir = path.join(process.env.APPDATA, 'Code/User')
          }
          break
        }
        default: {
          configDir = path.join(homeDir, '.config/Code/User')
        }
      }
      return configDir && existsSync(configDir) ? path.join(configDir, 'mcp.json') : null
    },
  },
  'VS Code Insiders': {
    buildServerConfig: defaultHttpConfig,
    configKey: 'servers',
    detect: async () => {
      let configDir: string | null = null
      switch (process.platform) {
        case 'darwin': {
          configDir = path.join(homeDir, 'Library/Application Support/Code - Insiders/User')
          break
        }
        case 'win32': {
          if (process.env.APPDATA) {
            configDir = path.join(process.env.APPDATA, 'Code - Insiders/User')
          }
          break
        }
        default: {
          configDir = path.join(homeDir, '.config/Code - Insiders/User')
        }
      }
      return configDir && existsSync(configDir) ? path.join(configDir, 'mcp.json') : null
    },
  },
  Zed: {
    buildServerConfig: (token) => ({
      headers: {Authorization: `Bearer ${token}`},
      settings: {},
      url: MCP_SERVER_URL,
    }),
    configKey: 'context_servers',
    detect: async () => {
      let configDir: string | null = null
      switch (process.platform) {
        case 'win32': {
          if (process.env.APPDATA) {
            configDir = path.join(process.env.APPDATA, 'Zed')
          }
          break
        }
        default: {
          configDir = path.join(homeDir, '.config/zed')
        }
      }
      return configDir && existsSync(configDir) ? path.join(configDir, 'settings.json') : null
    },
  },
} satisfies Record<string, EditorConfig>

/** Derived from EDITOR_CONFIGS keys - add a new editor there and this updates automatically */
export type EditorName = keyof typeof EDITOR_CONFIGS
