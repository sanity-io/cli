import {existsSync, type PathLike} from 'node:fs'
import fs from 'node:fs/promises'

import {checkbox} from '@sanity/cli-core/ux'
import {convertToSystemPath, createTestToken, mockApi, testCommand} from '@sanity/cli-test'
import {execa} from 'execa'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {MCP_API_VERSION} from '../../../services/mcp.js'
import {ConfigureMcpCommand} from '../configure.js'

const mockEnsureAuthenticated = vi.hoisted(() => vi.fn())
const mockIsInteractive = vi.hoisted(() => vi.fn().mockReturnValue(true))

vi.mock('../../../actions/auth/ensureAuthenticated.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../actions/auth/ensureAuthenticated.js')>()
  return {
    ...actual,
    ensureAuthenticated: mockEnsureAuthenticated,
  }
})

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    isInteractive: mockIsInteractive,
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    checkbox: vi.fn(),
  }
})

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    default: {
      mkdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  }
})

vi.mock('execa', () => ({
  execa: vi.fn(),
}))

const mockCheckbox = vi.mocked(checkbox)
const mockExistsSync = vi.mocked(existsSync)
const mockReadFile = vi.mocked(fs.readFile)
const mockWriteFile = vi.mocked(fs.writeFile)
const mockExeca = vi.mocked(execa)

// ---------------------------------------------------------------------------
// Helpers for table-driven per-editor tests
// ---------------------------------------------------------------------------

interface EditorTestCase {
  /** How to make this editor detectable */
  detect: {
    /** CLI commands that should succeed (e.g. ['codex', 'claude']) */
    cliCommands?: string[]
    /** Env vars to set for this test */
    env?: Record<string, string>
    /** existsSync predicate — receives the path string */
    existsSync?: (p: string) => boolean
    /** Platform to override via Object.defineProperty */
    overridePlatform?: NodeJS.Platform
  }
  /** Substring the written config path must contain */
  expectedConfigPath: string
  /** Editor name as it appears in EDITOR_CONFIGS */
  name: string

  /** Extra substrings the written content must contain */
  expectedContentChecks?: string[]
  /** Only run on this platform (skipped otherwise) */
  platform?: NodeJS.Platform
}

const EXECA_SUCCESS = {
  command: 'test --version',
  exitCode: 0,
  failed: false,
  killed: false,
  signal: undefined,
  stderr: '',
  stdout: '1.0.0',
  timedOut: false,
} as never

const MCP_SETUP_PROMPT_MESSAGE = 'Where should Sanity MCP be configured?'

function configuredPromptChoice(name: string) {
  return {
    checked: true,
    description: 'Configured',
    name,
    value: name,
  }
}

function expectConfiguredPrompt(name: string): void {
  expect(mockCheckbox).toHaveBeenCalledWith({
    choices: [configuredPromptChoice(name)],
    message: MCP_SETUP_PROMPT_MESSAGE,
  })
}

function mockClaudeCodeDetected(): void {
  mockExeca.mockImplementation((async (command: string | URL) => {
    if (command === 'claude') return EXECA_SUCCESS
    throw new Error('Not installed')
  }) as never)
}

function applyPlatformOverride(platform?: NodeJS.Platform): () => void {
  if (!platform) return () => undefined
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', {value: platform})
  return () => Object.defineProperty(process, 'platform', {value: originalPlatform})
}

function applyEnvOverrides(env?: Record<string, string>): () => void {
  const envBackups: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(env ?? {})) {
    envBackups[key] = process.env[key]
    process.env[key] = value
  }

  return () => {
    for (const [key, original] of Object.entries(envBackups)) {
      if (original === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original
      }
    }
  }
}

function mockEditorDetection(detect: EditorTestCase['detect']): void {
  if (detect.existsSync) {
    const predicate = detect.existsSync
    mockExistsSync.mockImplementation((p: PathLike) => predicate(String(p)))
  }

  if (detect.cliCommands) {
    const commands = detect.cliCommands
    mockExeca.mockImplementation((async (command: string | URL) => {
      if (commands.includes(String(command))) return EXECA_SUCCESS
      throw new Error('Not installed')
    }) as never)
  }
}

function expectEditorConfigWritten(tc: EditorTestCase): void {
  expect(mockWriteFile).toHaveBeenCalledWith(
    expect.stringContaining(convertToSystemPath(tc.expectedConfigPath)),
    expect.not.stringContaining('Authorization'),
    'utf8',
  )
}

function expectContentChecks(tc: EditorTestCase): void {
  const writtenContent = mockWriteFile.mock.calls[0]?.[1] as string
  for (const check of tc.expectedContentChecks ?? []) {
    expect(writtenContent, `written content should contain "${check}"`).toContain(check)
  }
}

/** Shared helper: sets up mocks, runs command, asserts outputs for a single editor. */
async function runEditorTest(tc: EditorTestCase): Promise<void> {
  const restorePlatform = applyPlatformOverride(tc.detect.overridePlatform)
  const restoreEnv = applyEnvOverrides(tc.detect.env)

  try {
    mockEditorDetection(tc.detect)
    mockCheckbox.mockResolvedValue([tc.name])
    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expectEditorConfigWritten(tc)
    expectContentChecks(tc)
    expect(stdout).toContain(`MCP configured for ${tc.name}`)
  } finally {
    restorePlatform()
    restoreEnv()
  }
}

// ---------------------------------------------------------------------------
// Test cases — one entry per editor/variant
// ---------------------------------------------------------------------------

const editorTestCases: EditorTestCase[] = [
  {
    detect: {existsSync: (p) => p.endsWith('.cursor')},
    expectedConfigPath: '.cursor/mcp.json',
    name: 'Cursor',
  },
  {
    detect: {
      existsSync: (p) => p.endsWith('Code/User'),
      overridePlatform: 'darwin',
    },
    expectedConfigPath: 'Code/User/mcp.json',
    name: 'VS Code',
    platform: 'darwin',
  },
  {
    detect: {
      env: {APPDATA: String.raw`C:\Users\test\AppData\Roaming`},
      existsSync: (p) => p.includes(String.raw`AppData\Roaming\Code\User`),
      overridePlatform: 'win32',
    },
    expectedConfigPath: String.raw`AppData\Roaming\Code\User\mcp.json`,
    name: 'VS Code',
    platform: 'win32',
  },
  {
    detect: {
      existsSync: (p) => p.endsWith('Code - Insiders/User'),
      overridePlatform: 'darwin',
    },
    expectedConfigPath: 'Code - Insiders/User/mcp.json',
    name: 'VS Code Insiders',
    platform: 'darwin',
  },
  {
    detect: {
      env: {APPDATA: String.raw`C:\Users\test\AppData\Roaming`},
      existsSync: (p) => p.includes(String.raw`AppData\Roaming\Code - Insiders\User`),
      overridePlatform: 'win32',
    },
    expectedConfigPath: String.raw`AppData\Roaming\Code - Insiders\User\mcp.json`,
    name: 'VS Code Insiders',
    platform: 'win32',
  },
  {
    detect: {cliCommands: ['claude']},
    expectedConfigPath: '.claude.json',
    name: 'Claude Code',
  },
  {
    detect: {
      existsSync: (p) => {
        const n = p.replaceAll('\\', '/')
        return n.endsWith('/.gemini/antigravity')
      },
    },
    expectedConfigPath: '.gemini/antigravity/mcp_config.json',
    expectedContentChecks: ['serverUrl'],
    name: 'Antigravity',
  },
  {
    detect: {
      existsSync: (p) => {
        const n = p.replaceAll('\\', '/')
        return n.endsWith('/Code/User/globalStorage/saoudrizwan.claude-dev/settings')
      },
    },
    expectedConfigPath:
      'Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
    name: 'Cline',
  },
  {
    detect: {
      env: {
        CLINE_DIR:
          process.platform === 'win32'
            ? String.raw`C:\tmp\custom-cline-home`
            : '/tmp/custom-cline-home',
      },
      existsSync: (p) => {
        const n = p.replaceAll('\\', '/')
        return n.endsWith('/tmp/custom-cline-home')
      },
    },
    expectedConfigPath: convertToSystemPath(
      '/tmp/custom-cline-home/data/settings/cline_mcp_settings.json',
    ),
    name: 'Cline CLI',
  },
  {
    detect: {
      existsSync: (p) => {
        const n = p.replaceAll('\\', '/')
        return n.endsWith('/.gemini/settings.json')
      },
    },
    expectedConfigPath: '.gemini/settings.json',
    name: 'Gemini CLI',
  },
  {
    detect: {
      existsSync: (p) => {
        const n = p.replaceAll('\\', '/')
        return /\/.?copilot(?:\/|$)/.test(n)
      },
    },
    expectedConfigPath: 'mcp-config.json',
    expectedContentChecks: ['"tools"'],
    name: 'GitHub Copilot CLI',
  },
  {
    detect: {
      env: {XDG_CONFIG_HOME: '/home/user/.config'},
      existsSync: (p) => p.includes('/home/user/.config/copilot'),
    },
    expectedConfigPath: '/home/user/.config/copilot/mcp-config.json',
    name: 'GitHub Copilot CLI',
    platform: 'linux',
  },
  {
    detect: {cliCommands: ['opencode'], overridePlatform: 'darwin'},
    expectedConfigPath: '.config/opencode/opencode.json',
    name: 'OpenCode',
    platform: 'darwin',
  },
  {
    detect: {cliCommands: ['codex']},
    expectedConfigPath: '.codex/config.toml',
    expectedContentChecks: ['[mcp_servers.Sanity]'],
    name: 'Codex CLI',
  },
  {
    detect: {
      cliCommands: ['codex'],
      env: {
        CODEX_HOME:
          process.platform === 'win32'
            ? String.raw`C:\tmp\custom-codex-home`
            : '/tmp/custom-codex-home',
      },
    },
    expectedConfigPath: convertToSystemPath('/tmp/custom-codex-home/config.toml'),
    name: 'Codex CLI',
  },
  {
    detect: {
      existsSync: (p) => p.includes('.config/zed'),
      overridePlatform: 'darwin',
    },
    expectedConfigPath: '.config/zed/settings.json',
    name: 'Zed',
    platform: 'darwin',
  },
  {
    detect: {
      env: {APPDATA: String.raw`C:\Users\test\AppData\Roaming`},
      existsSync: (p) => p.includes(String.raw`AppData\Roaming\Zed`),
      overridePlatform: 'win32',
    },
    expectedConfigPath: String.raw`AppData\Roaming\Zed\settings.json`,
    name: 'Zed',
    platform: 'win32',
  },
]

function existsForMCPorterFiles(options: {json: boolean; jsonc: boolean}): (p: string) => boolean {
  return (p) => {
    const n = p.replaceAll('\\', '/')
    if (n.endsWith('/.mcporter')) return true
    if (n.endsWith('/.mcporter/mcporter.json')) return options.json
    if (n.endsWith('/.mcporter/mcporter.jsonc')) return options.jsonc
    return false
  }
}

// MCPorter has three variants for file format detection
const mcporterTestCases: Array<{
  existsSync: (p: string) => boolean
  expectedConfigPath: string
  label: string
}> = [
  {
    existsSync: existsForMCPorterFiles({json: false, jsonc: true}),
    expectedConfigPath: '.mcporter/mcporter.jsonc',
    label: 'existing jsonc config',
  },
  {
    existsSync: existsForMCPorterFiles({json: true, jsonc: false}),
    expectedConfigPath: '.mcporter/mcporter.json',
    label: 'existing json config',
  },
  {
    existsSync: existsForMCPorterFiles({json: false, jsonc: false}),
    expectedConfigPath: '.mcporter/mcporter.json',
    label: 'fresh install (defaults to json)',
  },
]

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------

describe('#mcp:configure', () => {
  beforeEach(async () => {
    mockEnsureAuthenticated.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'github',
    })
    mockExistsSync.mockReturnValue(false)
    mockReadFile.mockResolvedValue('{}') // Default: empty config file
    mockWriteFile.mockResolvedValue()
    mockExeca.mockRejectedValue(new Error('Not installed'))
    createTestToken('test-token')
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  // -------------------------------------------------------------------------
  // Per-editor detection (table-driven)
  // -------------------------------------------------------------------------

  describe('editor detection and configuration', () => {
    for (const tc of editorTestCases) {
      const suffix = tc.platform ? ` on ${tc.platform}` : ''
      const envNote = tc.detect.env ? ` (${Object.keys(tc.detect.env).join(', ')})` : ''
      const label = `detects ${tc.name}${suffix}${envNote} and configures it`

      test.runIf(!tc.platform || process.platform === tc.platform)(label, () => runEditorTest(tc))
    }

    // MCPorter file-format variants
    for (const mc of mcporterTestCases) {
      test(`detects MCPorter with ${mc.label} and configures it`, () =>
        runEditorTest({
          detect: {existsSync: mc.existsSync},
          expectedConfigPath: mc.expectedConfigPath,
          name: 'MCPorter',
        }))
    }
  })

  // -------------------------------------------------------------------------
  // Codex CLI: unparseable TOML skips editor
  // -------------------------------------------------------------------------

  test('skips Codex CLI when existing TOML config is unparseable', async () => {
    mockExeca.mockImplementation((async (command: string | URL) => {
      if (command === 'codex') return EXECA_SUCCESS
      throw new Error('Not installed')
    }) as never)

    mockExistsSync.mockImplementation((p: PathLike) => {
      const normalized = String(p).replaceAll('\\', '/')
      return normalized.endsWith('/config.toml')
    })
    mockReadFile.mockResolvedValue('[[[')
    mockCheckbox.mockResolvedValue([])

    await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Edge cases and no-editor scenario
  // -------------------------------------------------------------------------

  test('shows warning when no editors are detected', async () => {
    mockExistsSync.mockReturnValue(false)
    mockExeca.mockRejectedValue(new Error('Not installed'))

    const {error, stderr} = await testCommand(ConfigureMcpCommand, [])

    if (error) throw error

    expect(stderr).toContain("Couldn't auto-configure Sanity MCP server for your editor")
    expect(stderr).toContain('https://mcp.sanity.io')
  })

  // -------------------------------------------------------------------------
  // Token lifecycle
  // -------------------------------------------------------------------------

  test('shows already configured editors in the prompt and overwrites selected config', async () => {
    mockClaudeCodeDetected()

    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).endsWith('.claude.json')
    })

    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          Sanity: {
            headers: {
              Authorization: 'Bearer existing-token',
            },
            type: 'http',
            url: 'https://mcp.sanity.io',
          },
        },
      }),
    )

    // Token validation succeeds against Sanity API
    mockApi({apiVersion: MCP_API_VERSION, method: 'get', uri: '/users/me'}).reply(200, {
      id: 'user-123',
      name: 'Test User',
    })

    mockCheckbox.mockResolvedValue(['Claude Code'])

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expectConfiguredPrompt('Claude Code')
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.claude.json')),
      expect.not.stringContaining('existing-token'),
      'utf8',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.claude.json')),
      expect.not.stringContaining('Authorization'),
      'utf8',
    )
    expect(stdout).toContain('MCP configured for Claude Code')
  })

  test('shows OAuth editor configured without a bearer token in the prompt', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
    })

    // Cursor config has Sanity entry but no Authorization header (pure OAuth)
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          Sanity: {
            type: 'http',
            url: 'https://mcp.sanity.io',
          },
        },
      }),
    )

    // No /users/me mock — OAuth configs with no token skip validation entirely

    mockCheckbox.mockResolvedValue(['Cursor'])

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expectConfiguredPrompt('Cursor')
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.cursor/mcp.json')),
      expect.not.stringContaining('Bearer'),
      'utf8',
    )
    expect(stdout).toContain('MCP configured for Cursor')
  })

  test('shows legacy token configs as configured when token is invalid', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
    })

    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          Sanity: {
            headers: {
              Authorization: 'Bearer expired-token',
            },
            type: 'http',
            url: 'https://mcp.sanity.io',
          },
        },
      }),
    )

    // Token validation fails against Sanity API (dead token)
    mockApi({apiVersion: MCP_API_VERSION, method: 'get', uri: '/users/me'}).reply(401, {
      error: 'Unauthorized',
      message: 'Invalid token',
      statusCode: 401,
    })

    mockCheckbox.mockResolvedValue(['Cursor'])

    await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {
          checked: true,
          description: 'Configured',
          name: 'Cursor',
          value: 'Cursor',
        },
      ],
      message: MCP_SETUP_PROMPT_MESSAGE,
    })
  })

  test('removes Sanity MCP config for already configured editors that are deselected', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
    })

    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          OtherServer: {
            type: 'stdio',
          },
          Sanity: {
            type: 'http',
            url: 'https://mcp.sanity.io',
          },
        },
      }),
    )

    mockCheckbox.mockResolvedValue([])

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.cursor/mcp.json')),
      expect.not.stringContaining('"Sanity"'),
      'utf8',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.cursor/mcp.json')),
      expect.stringContaining('OtherServer'),
      'utf8',
    )
    expect(stdout).toContain('MCP removed from Cursor')
  })

  test('does not reuse a valid legacy token when configuring OAuth clients', async () => {
    mockClaudeCodeDetected()

    // Detect both Claude Code (configured with valid token) and Gemini (unconfigured)
    mockExistsSync.mockImplementation((path: PathLike) => {
      const normalized = String(path).replaceAll('\\', '/')
      return normalized.endsWith('/.claude.json') || normalized.endsWith('/.gemini/settings.json')
    })

    // Claude Code has existing config with valid token, Gemini has empty config
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      if (String(filePath).includes('.claude.json')) {
        return JSON.stringify({
          mcpServers: {
            Sanity: {
              headers: {Authorization: 'Bearer valid-reusable-token'},
              type: 'http',
              url: 'https://mcp.sanity.io',
            },
          },
        })
      }
      return '{}'
    })

    // Token validation succeeds against Sanity API
    mockApi({apiVersion: MCP_API_VERSION, method: 'get', uri: '/users/me'}).reply(200, {
      id: 'user-123',
      name: 'Test User',
    })

    // User keeps Claude Code selected and adds Gemini CLI
    mockCheckbox.mockResolvedValue(['Claude Code', 'Gemini CLI'])

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.gemini/settings.json')),
      expect.not.stringContaining('valid-reusable-token'),
      'utf8',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.gemini/settings.json')),
      expect.not.stringContaining('Authorization'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Claude Code, Gemini CLI')
  })

  // -------------------------------------------------------------------------
  // User interaction
  // -------------------------------------------------------------------------

  test('exits gracefully when user deselects all editors', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
    })

    mockCheckbox.mockResolvedValue([])

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(stdout).toContain('MCP configuration skipped')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  test('configures multiple editors when selected', async () => {
    mockExistsSync.mockReturnValue(true)

    mockCheckbox.mockResolvedValue(['Cursor', 'VS Code'])

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockWriteFile).toHaveBeenCalledTimes(2)

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.cursor/mcp.json')),
      expect.not.stringContaining('Authorization'),
      'utf8',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('Code/User/mcp.json')),
      expect.not.stringContaining('Authorization'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Cursor, VS Code')
  })

  test('auto-selects all editors in non-interactive mode without prompting', async () => {
    mockIsInteractive.mockReturnValue(false)

    mockClaudeCodeDetected()

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).not.toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.claude.json'),
      expect.not.stringContaining('Authorization'),
      'utf8',
    )
    expect(stdout).toContain('MCP configured for Claude Code')
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  test('configures OAuth clients without creating a token', async () => {
    mockClaudeCodeDetected()

    mockCheckbox.mockResolvedValue(['Claude Code'])

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.claude.json'),
      expect.not.stringContaining('Authorization'),
      'utf8',
    )
    expect(stdout).toContain('MCP configured for Claude Code')
  })

  test('handles file write error gracefully', async () => {
    mockClaudeCodeDetected()

    mockCheckbox.mockResolvedValue(['Claude Code'])

    mockWriteFile.mockRejectedValue(new Error('Permission denied'))

    const {stderr} = await testCommand(ConfigureMcpCommand, [])

    expect(stderr).toContain('Could not configure MCP')
    expect(stderr).toContain('https://mcp.sanity.io')
  })

  test('suggests login when login fails', async () => {
    const {LoginError} = await import('../../../errors/LoginError.js')
    mockEnsureAuthenticated.mockRejectedValue(new LoginError('No authentication providers found'))

    const {error} = await testCommand(ConfigureMcpCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No authentication providers found')
    expect(error?.message).toContain('Try running `sanity login`')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows raw error for network failures without suggesting login', async () => {
    mockEnsureAuthenticated.mockRejectedValue(new Error('request timed out'))

    const {error} = await testCommand(ConfigureMcpCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('request timed out')
    expect(error?.message).not.toContain('sanity login')
    expect(error?.oclif?.exit).toBe(1)
  })

  // -------------------------------------------------------------------------
  // Config merging
  // -------------------------------------------------------------------------

  test('merges with existing config file', async () => {
    mockClaudeCodeDetected()

    mockExistsSync.mockImplementation((p: PathLike) => {
      return String(p).endsWith('.claude.json')
    })

    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          OtherServer: {
            type: 'stdio',
          },
        },
      }),
    )

    mockCheckbox.mockResolvedValue(['Claude Code'])

    await testCommand(ConfigureMcpCommand, [])

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('OtherServer'),
      'utf8',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Sanity'),
      'utf8',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.stringContaining('Authorization'),
      'utf8',
    )
  })
})
