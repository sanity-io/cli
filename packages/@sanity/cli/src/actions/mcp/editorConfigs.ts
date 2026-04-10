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
  /** Extracts the auth token from a parsed Sanity server config block */
  readToken: (serverConfig: Record<string, unknown>) => string | undefined
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

async function detectAntigravity(): Promise<string | null> {
  const antigravityDir = path.join(homeDir, '.gemini/antigravity')
  return existsSync(antigravityDir) ? path.join(antigravityDir, 'mcp_config.json') : null
}

function getVSCodeUserDir(variant: 'insiders' | 'stable' = 'stable'): string | null {
  switch (process.platform) {
    case 'darwin': {
      return path.join(
        homeDir,
        variant === 'insiders'
          ? 'Library/Application Support/Code - Insiders/User'
          : 'Library/Application Support/Code/User',
      )
    }
    case 'win32': {
      if (!process.env.APPDATA) return null
      return path.join(
        process.env.APPDATA,
        variant === 'insiders' ? 'Code - Insiders/User' : 'Code/User',
      )
    }
    default: {
      return path.join(
        homeDir,
        variant === 'insiders' ? '.config/Code - Insiders/User' : '.config/Code/User',
      )
    }
  }
}

async function detectCline(): Promise<string | null> {
  const vscodeUserDir = getVSCodeUserDir()
  if (!vscodeUserDir) return null
  const clineConfigDir = path.join(vscodeUserDir, 'globalStorage/saoudrizwan.claude-dev/settings')
  return existsSync(clineConfigDir) ? path.join(clineConfigDir, 'cline_mcp_settings.json') : null
}

async function detectClineCli(): Promise<string | null> {
  const clineHome = process.env.CLINE_DIR || path.join(homeDir, '.cline')
  if (!existsSync(clineHome)) return null
  return path.join(clineHome, 'data/settings/cline_mcp_settings.json')
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
  // Antigravity stores its config under ~/.gemini/antigravity, so checking
  // only the parent ~/.gemini directory causes false Gemini CLI detection.
  const settingsPath = path.join(homeDir, '.gemini/settings.json')
  return existsSync(settingsPath) ? settingsPath : null
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
  const configDir = getVSCodeUserDir()
  return configDir && existsSync(configDir) ? path.join(configDir, 'mcp.json') : null
}

async function detectVSCodeInsiders(): Promise<string | null> {
  const configDir = getVSCodeUserDir('insiders')
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

async function detectMCPorter(): Promise<string | null> {
  const mcporterDir = path.join(homeDir, '.mcporter')
  if (!existsSync(mcporterDir)) return null

  const jsonPath = path.join(mcporterDir, 'mcporter.json')
  const jsoncPath = path.join(mcporterDir, 'mcporter.jsonc')
  if (existsSync(jsonPath)) return jsonPath
  if (existsSync(jsoncPath)) return jsoncPath
  return jsonPath
}

// -- Read token helpers --

/**
 * Extract a Bearer token from a headers-like object.
 * Looks for `Authorization: "Bearer <token>"` and returns the token portion.
 */
function extractBearerToken(headers: unknown): string | undefined {
  if (typeof headers !== 'object' || headers === null) return undefined
  const auth = (headers as Record<string, unknown>).Authorization
  if (typeof auth !== 'string') return undefined
  const match = auth.match(/^Bearer\s+(.+)$/)
  return match?.[1]
}

function readTokenFromHeaders(serverConfig: Record<string, unknown>): string | undefined {
  return extractBearerToken(serverConfig.headers)
}

function readTokenFromHttpHeaders(serverConfig: Record<string, unknown>): string | undefined {
  return extractBearerToken(serverConfig.http_headers)
}

// -- Defaults & build server config functions --

/** Most editors share these values — entries only need to declare `detect` + any overrides. */
const EDITOR_DEFAULTS = {
  buildServerConfig: defaultHttpConfig,
  configKey: 'mcpServers',
  format: 'jsonc' as const,
  readToken: readTokenFromHeaders,
}

function buildAntigravityServerConfig(token: string): Record<string, unknown> {
  return {
    headers: {Authorization: `Bearer ${token}`},
    serverUrl: MCP_SERVER_URL,
  }
}

function buildClineServerConfig(token: string): Record<string, unknown> {
  return {
    disabled: false,
    headers: {Authorization: `Bearer ${token}`},
    type: 'streamableHttp',
    url: MCP_SERVER_URL,
  }
}

function buildCodexCliServerConfig(token: string): Record<string, unknown> {
  return {
    http_headers: {Authorization: `Bearer ${token}`},
    type: 'http',
    url: MCP_SERVER_URL,
  }
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
  Antigravity: {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildAntigravityServerConfig,
    detect: detectAntigravity,
  },
  'Claude Code': {...EDITOR_DEFAULTS, detect: detectClaudeCode},
  Cline: {...EDITOR_DEFAULTS, buildServerConfig: buildClineServerConfig, detect: detectCline},
  'Cline CLI': {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildClineServerConfig,
    detect: detectClineCli,
  },
  'Codex CLI': {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildCodexCliServerConfig,
    configKey: 'mcp_servers',
    detect: detectCodexCli,
    format: 'toml' as const,
    readToken: readTokenFromHttpHeaders,
  },
  Cursor: {...EDITOR_DEFAULTS, detect: detectCursor},
  'Gemini CLI': {...EDITOR_DEFAULTS, detect: detectGeminiCli},
  'GitHub Copilot CLI': {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildGitHubCopilotCliServerConfig,
    detect: detectGitHubCopilotCli,
  },
  MCPorter: {...EDITOR_DEFAULTS, detect: detectMCPorter},
  OpenCode: {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildOpenCodeServerConfig,
    configKey: 'mcp',
    detect: detectOpenCode,
  },
  'VS Code': {...EDITOR_DEFAULTS, configKey: 'servers', detect: detectVSCode},
  'VS Code Insiders': {...EDITOR_DEFAULTS, configKey: 'servers', detect: detectVSCodeInsiders},
  Zed: {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildZedServerConfig,
    configKey: 'context_servers',
    detect: detectZed,
  },
} satisfies Record<string, EditorConfig>

/** Derived from EDITOR_CONFIGS keys - add a new editor there and this updates automatically */
export type EditorName = keyof typeof EDITOR_CONFIGS
