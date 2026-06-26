import {existsSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {execa} from 'execa'

import {MCP_SERVER_URL} from '../../services/mcp.js'

/**
 * Environment abstraction for editor detection.
 *
 * Detect functions receive this instead of using module-level imports, making
 * each function independently testable without global mocks.
 */
export interface DetectionEnv {
  env: Record<string, string | undefined>
  /** Run a CLI command to check if a tool is installed. Rejects on failure. */
  execCommand: (cmd: string, args: string[]) => Promise<void>
  existsSync: (p: string) => boolean
  homedir: string
  platform: NodeJS.Platform
}

/** Create the real detection environment backed by process/OS globals. */
export function createDetectionEnv(): DetectionEnv {
  return {
    env: process.env,
    execCommand: (cmd, args) => execa(cmd, args, {stdio: 'pipe', timeout: 5000}).then(() => {}),
    existsSync,
    homedir: os.homedir(),
    platform: process.platform,
  }
}

interface EditorConfig {
  /** Builds the server config with API token. If oauthOnly is true, the token is not used */
  buildServerConfig: (token: string) => Record<string, unknown>
  configKey: string
  /** Returns the config file path if editor is detected, null otherwise */
  detect: (env: DetectionEnv) => Promise<string | null>
  format: 'jsonc' | 'toml'
  /** Extracts the auth token from a parsed Sanity server config block */
  readToken: (serverConfig: Record<string, unknown>) => string | undefined

  /** If true, this editor uses OAuth natively and does not need an embedded API token */
  oauthOnly?: boolean
  /**
   * Corresponding `--agent` value for the `skills` CLI (https://github.com/vercel-labs/skills).
   * Omit when the editor has no skills CLI equivalent.
   */
  skillsCliAgent?: string
  /**
   * The directory to install skills to.
   */
  skillsDir?: string
}

/**
 * The Sanity MCP server uses OAuth by default
 * If a token is provided, the server will not use OAuth instead tool calls will use the API token
 */
const defaultHttpConfig = (token?: string) => {
  const defaultConfig: Record<string, unknown> = {
    type: 'http',
    url: MCP_SERVER_URL,
  }

  if (token) {
    defaultConfig.headers = {Authorization: `Bearer ${token}`}
  }

  return defaultConfig
}

// -- Detect functions --

async function detectClaudeCode(ctx: DetectionEnv): Promise<string | null> {
  try {
    await ctx.execCommand('claude', ['--version'])
    return path.join(ctx.homedir, '.claude.json')
  } catch {
    return null
  }
}

async function detectAntigravity(ctx: DetectionEnv): Promise<string | null> {
  const antigravityDir = path.join(ctx.homedir, '.gemini/antigravity')
  return ctx.existsSync(antigravityDir) ? path.join(antigravityDir, 'mcp_config.json') : null
}

export function getVSCodeUserDir(
  ctx: DetectionEnv,
  variant: 'insiders' | 'stable' = 'stable',
): string | null {
  switch (ctx.platform) {
    case 'darwin': {
      return path.join(
        ctx.homedir,
        variant === 'insiders'
          ? 'Library/Application Support/Code - Insiders/User'
          : 'Library/Application Support/Code/User',
      )
    }
    case 'win32': {
      if (!ctx.env.APPDATA) return null
      return path.join(
        ctx.env.APPDATA,
        variant === 'insiders' ? 'Code - Insiders/User' : 'Code/User',
      )
    }
    default: {
      return path.join(
        ctx.homedir,
        variant === 'insiders' ? '.config/Code - Insiders/User' : '.config/Code/User',
      )
    }
  }
}

async function detectCline(ctx: DetectionEnv): Promise<string | null> {
  const vscodeUserDir = getVSCodeUserDir(ctx)
  if (!vscodeUserDir) return null
  const clineConfigDir = path.join(vscodeUserDir, 'globalStorage/saoudrizwan.claude-dev/settings')
  return ctx.existsSync(clineConfigDir)
    ? path.join(clineConfigDir, 'cline_mcp_settings.json')
    : null
}

async function detectClineCli(ctx: DetectionEnv): Promise<string | null> {
  const clineHome = ctx.env.CLINE_DIR || path.join(ctx.homedir, '.cline')
  if (!ctx.existsSync(clineHome)) return null
  return path.join(clineHome, 'data/settings/cline_mcp_settings.json')
}

async function detectCodexCli(ctx: DetectionEnv): Promise<string | null> {
  try {
    await ctx.execCommand('codex', ['--version'])
    const codexHome = ctx.env.CODEX_HOME || path.join(ctx.homedir, '.codex')
    return path.join(codexHome, 'config.toml')
  } catch {
    return null
  }
}

async function detectCursor(ctx: DetectionEnv): Promise<string | null> {
  const cursorDir = path.join(ctx.homedir, '.cursor')
  return ctx.existsSync(cursorDir) ? path.join(cursorDir, 'mcp.json') : null
}

async function detectGeminiCli(ctx: DetectionEnv): Promise<string | null> {
  // Antigravity stores its config under ~/.gemini/antigravity, so checking
  // only the parent ~/.gemini directory causes false Gemini CLI detection.
  const settingsPath = path.join(ctx.homedir, '.gemini/settings.json')
  return ctx.existsSync(settingsPath) ? settingsPath : null
}

async function detectGitHubCopilotCli(ctx: DetectionEnv): Promise<string | null> {
  const copilotDir =
    ctx.platform === 'linux' && ctx.env.XDG_CONFIG_HOME
      ? path.join(ctx.env.XDG_CONFIG_HOME, 'copilot')
      : path.join(ctx.homedir, '.copilot')
  return ctx.existsSync(copilotDir) ? path.join(copilotDir, 'mcp-config.json') : null
}

async function detectOpenCode(ctx: DetectionEnv): Promise<string | null> {
  try {
    await ctx.execCommand('opencode', ['--version'])
    return path.join(ctx.homedir, '.config/opencode/opencode.json')
  } catch {
    return null
  }
}

async function detectVSCode(ctx: DetectionEnv): Promise<string | null> {
  const configDir = getVSCodeUserDir(ctx)
  return configDir && ctx.existsSync(configDir) ? path.join(configDir, 'mcp.json') : null
}

async function detectVSCodeInsiders(ctx: DetectionEnv): Promise<string | null> {
  const configDir = getVSCodeUserDir(ctx, 'insiders')
  return configDir && ctx.existsSync(configDir) ? path.join(configDir, 'mcp.json') : null
}

async function detectZed(ctx: DetectionEnv): Promise<string | null> {
  let configDir: string | null = null
  switch (ctx.platform) {
    case 'win32': {
      if (ctx.env.APPDATA) {
        configDir = path.join(ctx.env.APPDATA, 'Zed')
      }
      break
    }
    default: {
      configDir = path.join(ctx.homedir, '.config/zed')
    }
  }
  return configDir && ctx.existsSync(configDir) ? path.join(configDir, 'settings.json') : null
}

async function detectMCPorter(ctx: DetectionEnv): Promise<string | null> {
  const mcporterDir = path.join(ctx.homedir, '.mcporter')
  if (!ctx.existsSync(mcporterDir)) return null

  const jsonPath = path.join(mcporterDir, 'mcporter.json')
  const jsoncPath = path.join(mcporterDir, 'mcporter.jsonc')
  if (ctx.existsSync(jsonPath)) return jsonPath
  if (ctx.existsSync(jsoncPath)) return jsoncPath
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

export const UNIVERSAL_SKILLS_DIR = '.agents/skills'
/** Most editors share these values — entries only need to declare `detect` + any overrides. */
const EDITOR_DEFAULTS = {
  buildServerConfig: defaultHttpConfig,
  configKey: 'mcpServers',
  format: 'jsonc' as const,
  oauthOnly: false,
  readToken: readTokenFromHeaders,
  skillsDir: UNIVERSAL_SKILLS_DIR,
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
 * To add a new editor: add an entry here — EditorName type is derived automatically.
 *
 * Each entry includes a doc URL pointing to the source of truth for its
 * config path and format. When updating a path, verify against the linked
 * documentation first.
 */
export const EDITOR_CONFIGS = {
  // Doc: https://support.google.com/gemini/answer/16255176 (Antigravity / Project Mariner)
  Antigravity: {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildAntigravityServerConfig,
    detect: detectAntigravity,
    skillsCliAgent: 'antigravity',
  },
  // Doc: https://docs.anthropic.com/en/docs/claude-code/mcp
  // Path: ~/.claude.json  Key: mcpServers
  'Claude Code': {
    ...EDITOR_DEFAULTS,
    detect: detectClaudeCode,
    oauthOnly: true,
    skillsCliAgent: 'claude-code',
    skillsDir: '.claude/skills',
  },
  // Doc: https://github.com/cline/cline — VS Code extension (saoudrizwan.claude-dev)
  // Path: <VS Code User>/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
  Cline: {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildClineServerConfig,
    detect: detectCline,
    skillsCliAgent: 'cline',
  },
  // Doc: https://github.com/cline/cline — standalone CLI mode
  // Path: $CLINE_DIR || ~/.cline/data/settings/cline_mcp_settings.json
  'Cline CLI': {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildClineServerConfig,
    detect: detectClineCli,
    skillsCliAgent: 'cline',
  },
  // Doc: https://platform.openai.com/docs/guides/tools-remote-mcp#codex-cli
  // Path: $CODEX_HOME || ~/.codex/config.toml  Key: mcp_servers  Format: TOML
  'Codex CLI': {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildCodexCliServerConfig,
    configKey: 'mcp_servers',
    detect: detectCodexCli,
    format: 'toml' as const,
    readToken: readTokenFromHttpHeaders,
    skillsCliAgent: 'codex',
  },
  // Doc: https://docs.cursor.com/context/model-context-protocol
  // Path: ~/.cursor/mcp.json  Key: mcpServers
  Cursor: {
    ...EDITOR_DEFAULTS,
    detect: detectCursor,
    oauthOnly: true,
    skillsCliAgent: 'cursor',
  },
  // Doc: https://googlegemini.wiki/gemini-cli/mcp-servers
  // Path: ~/.gemini/settings.json  Key: mcpServers
  'Gemini CLI': {...EDITOR_DEFAULTS, detect: detectGeminiCli, skillsCliAgent: 'gemini-cli'},
  // Doc: https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-coding-agent-with-mcp
  // Path: ~/.copilot/mcp-config.json (or $XDG_CONFIG_HOME/copilot on Linux)  Key: mcpServers
  'GitHub Copilot CLI': {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildGitHubCopilotCliServerConfig,
    detect: detectGitHubCopilotCli,
    skillsCliAgent: 'github-copilot',
  },
  // Doc: https://github.com/nicobailon/mcporter
  // Path: ~/.mcporter/mcporter.{json,jsonc}  Key: mcpServers
  MCPorter: {...EDITOR_DEFAULTS, detect: detectMCPorter},
  // Doc: https://opencode.ai/docs/config
  // Path: ~/.config/opencode/opencode.json  Key: mcp
  OpenCode: {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildOpenCodeServerConfig,
    configKey: 'mcp',
    detect: detectOpenCode,
    skillsCliAgent: 'opencode',
  },
  // Doc: https://code.visualstudio.com/docs/copilot/chat/mcp-servers
  // Path: <VS Code User dir>/mcp.json  Key: servers
  // VS Code uses GitHub Copilot for AI features; skills are installed via the
  // `github-copilot` agent (see https://code.visualstudio.com/docs/copilot/customization/agent-skills).
  'VS Code': {
    ...EDITOR_DEFAULTS,
    configKey: 'servers',
    detect: detectVSCode,
    skillsCliAgent: 'github-copilot',
  },
  // Doc: https://code.visualstudio.com/docs/copilot/chat/mcp-servers
  // Path: <VS Code Insiders User dir>/mcp.json  Key: servers
  'VS Code Insiders': {
    ...EDITOR_DEFAULTS,
    configKey: 'servers',
    detect: detectVSCodeInsiders,
    skillsCliAgent: 'github-copilot',
  },
  // Doc: https://zed.dev/docs/assistant/model-context-protocol
  // Path: ~/.config/zed/settings.json (or $APPDATA/Zed on Windows)  Key: context_servers
  // Zed doesn't support agent skills - https://github.com/zed-industries/zed/issues/49057
  Zed: {
    ...EDITOR_DEFAULTS,
    buildServerConfig: buildZedServerConfig,
    configKey: 'context_servers',
    detect: detectZed,
  },
} satisfies Record<string, EditorConfig>

/** Derived from EDITOR_CONFIGS keys - add a new editor there and this updates automatically */
export type EditorName = keyof typeof EDITOR_CONFIGS

export function getSkillsCliAgent(editorName: EditorName): string | undefined {
  if (editorName in EDITOR_CONFIGS) {
    const config = EDITOR_CONFIGS[editorName]
    return 'skillsCliAgent' in config ? config.skillsCliAgent : undefined
  }
}

/**
 * Skills-CLI agent ID → display name. Mirrors `displayName` from
 * `~/git/skills/src/agents.ts` for the subset of agents we install for. Used
 * to match `skills list --json` output (which keys by display name) against
 * our editors.
 */
const SKILLS_CLI_AGENT_DISPLAY_NAMES: Record<string, string> = {
  antigravity: 'Antigravity',
  'claude-code': 'Claude Code',
  cline: 'Cline',
  codex: 'Codex',
  cursor: 'Cursor',
  'gemini-cli': 'Gemini CLI',
  'github-copilot': 'GitHub Copilot',
  opencode: 'OpenCode',
}

export function isUniversalSkillsCliAgentByEditorName(editorName: EditorName): boolean {
  return EDITOR_CONFIGS[editorName]?.skillsDir === UNIVERSAL_SKILLS_DIR
}

/** Display name used by the skills CLI for the given editor, if it has a mapping. */
export function getSkillsCliAgentDisplayName(editorName: EditorName): string | undefined {
  const agent = getSkillsCliAgent(editorName)
  return agent ? SKILLS_CLI_AGENT_DISPLAY_NAMES[agent] : undefined
}

/** Display name for a skills-CLI agent ID (e.g. `'cursor'` → `'Cursor'`). */
export function getSkillsCliAgentDisplayNameById(agentId: string): string | undefined {
  return SKILLS_CLI_AGENT_DISPLAY_NAMES[agentId]
}

/**
 * The relative, home-anchored directory the `skills` CLI installs into for a
 * given agent ID (e.g. `'cursor'` → `'.agents/skills'`, `'claude-code'` →
 * `'.claude/skills'`). Derived from `EDITOR_CONFIGS` so it stays a single
 * source of truth.
 */
export function getSkillsCliAgentSkillsDir(agentName: string): string | undefined {
  for (const name of Object.keys(EDITOR_CONFIGS) as EditorName[]) {
    const config = EDITOR_CONFIGS[name]
    const agent = getSkillsCliAgent(name)
    if (agent === agentName) {
      return config.skillsDir
    }
  }
  return undefined
}
