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
  format: 'jsonc' | 'toml'
}

const defaultHttpConfig = (token: string) => ({
  headers: {Authorization: `Bearer ${token}`},
  type: 'http',
  url: MCP_SERVER_URL,
})

const homeDir = os.homedir()

// -- Detect functions --

async function detectClaudeCode(): Promise<string | null> {
  try {
    await execa('claude', ['--version'], {stdio: 'pipe', timeout: 5000})
    return path.join(homeDir, '.claude.json')
  } catch {
    return null
  }
}

async function detectCodexCli(): Promise<string | null> {
  try {
    await execa('codex', ['--version'], {stdio: 'pipe', timeout: 5000})
    const codexHome = process.env.CODEX_HOME || path.join(homeDir, '.codex')
    return path.join(codexHome, 'config.toml')
  } catch {
    return null
  }
}

async function detectCursor(): Promise<string | null> {
  const cursorDir = path.join(homeDir, '.cursor')
  return existsSync(cursorDir) ? path.join(cursorDir, 'mcp.json') : null
}

async function detectGeminiCli(): Promise<string | null> {
  const geminiDir = path.join(homeDir, '.gemini')
  return existsSync(geminiDir) ? path.join(geminiDir, 'settings.json') : null
}

async function detectGitHubCopilotCli(): Promise<string | null> {
  const copilotDir =
    process.platform === 'linux' && process.env.XDG_CONFIG_HOME
      ? path.join(process.env.XDG_CONFIG_HOME, 'copilot')
      : path.join(homeDir, '.copilot')
  return existsSync(copilotDir) ? path.join(copilotDir, 'mcp-config.json') : null
}

async function detectOpenCode(): Promise<string | null> {
  try {
    await execa('opencode', ['--version'], {stdio: 'pipe', timeout: 5000})
    return path.join(homeDir, '.config/opencode/opencode.json')
  } catch {
    return null
  }
}

async function detectVSCode(): Promise<string | null> {
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
}

async function detectVSCodeInsiders(): Promise<string | null> {
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
}

async function detectZed(): Promise<string | null> {
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
}

// -- Build server config functions --

function buildClaudeCodeServerConfig(token: string): Record<string, unknown> {
  return defaultHttpConfig(token)
}

function buildCodexCliServerConfig(token: string): Record<string, unknown> {
  return {
    http_headers: {Authorization: `Bearer ${token}`},
    type: 'http',
    url: MCP_SERVER_URL,
  }
}

function buildCursorServerConfig(token: string): Record<string, unknown> {
  return defaultHttpConfig(token)
}

function buildGeminiCliServerConfig(token: string): Record<string, unknown> {
  return defaultHttpConfig(token)
}

function buildGitHubCopilotCliServerConfig(token: string): Record<string, unknown> {
  return {
    headers: {Authorization: `Bearer ${token}`},
    tools: ['*'],
    type: 'http',
    url: MCP_SERVER_URL,
  }
}

function buildOpenCodeServerConfig(token: string): Record<string, unknown> {
  return {
    headers: {Authorization: `Bearer ${token}`},
    type: 'remote',
    url: MCP_SERVER_URL,
  }
}

function buildVSCodeServerConfig(token: string): Record<string, unknown> {
  return defaultHttpConfig(token)
}

function buildVSCodeInsidersServerConfig(token: string): Record<string, unknown> {
  return defaultHttpConfig(token)
}

function buildZedServerConfig(token: string): Record<string, unknown> {
  return {
    headers: {Authorization: `Bearer ${token}`},
    settings: {},
    url: MCP_SERVER_URL,
  }
}

/**
 * Centralized editor configuration including detection logic.
 * To add a new editor: add an entry here - EditorName type is derived automatically.
 */
export const EDITOR_CONFIGS = {
  'Claude Code': {
    buildServerConfig: buildClaudeCodeServerConfig,
    configKey: 'mcpServers',
    detect: detectClaudeCode,
    format: 'jsonc',
  },
  'Codex CLI': {
    buildServerConfig: buildCodexCliServerConfig,
    configKey: 'mcp_servers',
    detect: detectCodexCli,
    format: 'toml',
  },
  Cursor: {
    buildServerConfig: buildCursorServerConfig,
    configKey: 'mcpServers',
    detect: detectCursor,
    format: 'jsonc',
  },
  'Gemini CLI': {
    buildServerConfig: buildGeminiCliServerConfig,
    configKey: 'mcpServers',
    detect: detectGeminiCli,
    format: 'jsonc',
  },
  'GitHub Copilot CLI': {
    buildServerConfig: buildGitHubCopilotCliServerConfig,
    configKey: 'mcpServers',
    detect: detectGitHubCopilotCli,
    format: 'jsonc',
  },
  OpenCode: {
    buildServerConfig: buildOpenCodeServerConfig,
    configKey: 'mcp',
    detect: detectOpenCode,
    format: 'jsonc',
  },
  'VS Code': {
    buildServerConfig: buildVSCodeServerConfig,
    configKey: 'servers',
    detect: detectVSCode,
    format: 'jsonc',
  },
  'VS Code Insiders': {
    buildServerConfig: buildVSCodeInsidersServerConfig,
    configKey: 'servers',
    detect: detectVSCodeInsiders,
    format: 'jsonc',
  },
  Zed: {
    buildServerConfig: buildZedServerConfig,
    configKey: 'context_servers',
    detect: detectZed,
    format: 'jsonc',
  },
} satisfies Record<string, EditorConfig>

/** Derived from EDITOR_CONFIGS keys - add a new editor there and this updates automatically */
export type EditorName = keyof typeof EDITOR_CONFIGS
