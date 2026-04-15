import {existsSync, type PathLike} from 'node:fs'
import fs from 'node:fs/promises'

import {checkbox} from '@sanity/cli-core/ux'
import {convertToSystemPath, createTestToken, mockApi, testCommand} from '@sanity/cli-test'
import {execa} from 'execa'
import nock from 'nock'
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

  /** Extra substrings the written content must contain (beyond the token) */
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

/** Shared helper: sets up mocks, runs command, asserts outputs for a single editor. */
async function runEditorTest(tc: EditorTestCase): Promise<void> {
  const originalPlatform = process.platform
  const envBackups: Record<string, string | undefined> = {}

  try {
    // Platform override
    if (tc.detect.overridePlatform) {
      Object.defineProperty(process, 'platform', {value: tc.detect.overridePlatform})
    }

    // Env var overrides
    if (tc.detect.env) {
      for (const [key, value] of Object.entries(tc.detect.env)) {
        envBackups[key] = process.env[key]
        process.env[key] = value
      }
    }

    // existsSync mock
    if (tc.detect.existsSync) {
      const predicate = tc.detect.existsSync
      mockExistsSync.mockImplementation((p: PathLike) => predicate(String(p)))
    }

    // CLI mock — resolve for specific commands, reject for everything else
    if (tc.detect.cliCommands) {
      const commands = tc.detect.cliCommands
      mockExeca.mockImplementation((async (command: string | URL) => {
        if (commands.includes(String(command))) return EXECA_SUCCESS
        throw new Error('Not installed')
      }) as never)
    }

    mockCheckbox.mockResolvedValue([tc.name])

    const sessionId = `session-${tc.name.toLowerCase().replaceAll(/\s+/g, '-')}`
    const token = `test-token-${tc.name.toLowerCase().replaceAll(/\s+/g, '-')}`

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: sessionId, sid: sessionId})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: sessionId},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    // Assert config was written to the expected path with the token
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath(tc.expectedConfigPath)),
      expect.stringContaining(token),
      'utf8',
    )

    // Assert extra content checks
    if (tc.expectedContentChecks) {
      const writtenContent = mockWriteFile.mock.calls[0]?.[1] as string
      for (const check of tc.expectedContentChecks) {
        expect(writtenContent, `written content should contain "${check}"`).toContain(check)
      }
    }

    expect(stdout).toContain(`MCP configured for ${tc.name}`)
  } finally {
    // Restore platform
    if (tc.detect.overridePlatform) {
      Object.defineProperty(process, 'platform', {value: originalPlatform})
    }
    // Restore env vars
    for (const [key, original] of Object.entries(envBackups)) {
      if (original === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original
      }
    }
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
    expectedContentChecks: ['[mcp_servers.Sanity]', '[mcp_servers.Sanity.http_headers]'],
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

// MCPorter has three variants for file format detection
const mcporterTestCases: Array<{
  existsSync: (p: string) => boolean
  expectedConfigPath: string
  label: string
}> = [
  {
    existsSync: (p) => {
      const n = p.replaceAll('\\', '/')
      if (n.endsWith('/.mcporter')) return true
      if (n.endsWith('/.mcporter/mcporter.json')) return false
      if (n.endsWith('/.mcporter/mcporter.jsonc')) return true
      return false
    },
    expectedConfigPath: '.mcporter/mcporter.jsonc',
    label: 'existing jsonc config',
  },
  {
    existsSync: (p) => {
      const n = p.replaceAll('\\', '/')
      if (n.endsWith('/.mcporter')) return true
      if (n.endsWith('/.mcporter/mcporter.json')) return true
      if (n.endsWith('/.mcporter/mcporter.jsonc')) return false
      return false
    },
    expectedConfigPath: '.mcporter/mcporter.json',
    label: 'existing json config',
  },
  {
    existsSync: (p) => {
      const n = p.replaceAll('\\', '/')
      if (n.endsWith('/.mcporter')) return true
      if (n.endsWith('/.mcporter/mcporter.json')) return false
      if (n.endsWith('/.mcporter/mcporter.jsonc')) return false
      return false
    },
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
    const pending = nock.pendingMocks()
    nock.cleanAll()
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

  test('skips prompt when all configured editors have valid auth', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
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

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    // Should NOT prompt the user — everything is already configured
    expect(mockCheckbox).not.toHaveBeenCalled()
    expect(stdout).toContain('All detected editors are already configured')
  })

  test('shows auth expired annotation when configured token is invalid', async () => {
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

    // New token creation
    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-new', sid: 'session-new'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-new'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'new-token-123'})

    await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {
          checked: true,
          name: 'Cursor (auth expired)',
          value: 'Cursor',
        },
      ],
      message: 'Configure Sanity MCP server?',
    })
  })

  test('reuses valid token from another editor instead of creating new one', async () => {
    // Detect both Cursor (configured with valid token) and Gemini (unconfigured)
    mockExistsSync.mockImplementation((path: PathLike) => {
      const normalized = String(path).replaceAll('\\', '/')
      return normalized.includes('/.cursor') || normalized.endsWith('/.gemini/settings.json')
    })

    // Cursor has existing config with valid token, Gemini has empty config
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      if (String(filePath).includes('.cursor')) {
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

    // User selects only the unconfigured editor (Gemini CLI)
    mockCheckbox.mockResolvedValue(['Gemini CLI'])

    // NO /auth/session/create or /auth/fetch mocks — token should be reused

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    // Should write config with the reused token
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.gemini/settings.json')),
      expect.stringContaining('valid-reusable-token'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Gemini CLI')
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

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-multi', sid: 'session-multi'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-multi'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'multi-token-123'})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockWriteFile).toHaveBeenCalledTimes(2)
    expect(stdout).toContain('MCP configured for Cursor, VS Code')
  })

  test('auto-selects all editors in non-interactive mode without prompting', async () => {
    mockIsInteractive.mockReturnValue(false)

    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
    })

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-ci', sid: 'session-ci'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-ci'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'test-token-ci'})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).not.toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.cursor/mcp.json')),
      expect.stringContaining('test-token-ci'),
      'utf8',
    )
    expect(stdout).toContain('MCP configured for Cursor')
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  test('handles token creation error gracefully', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
    })

    mockCheckbox.mockResolvedValue(['Cursor'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(401, {message: 'Not authenticated'})

    const {stderr} = await testCommand(ConfigureMcpCommand, [])

    expect(stderr).toContain('Could not configure MCP')
    expect(stderr).toContain('https://mcp.sanity.io')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  test('handles file write error gracefully', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
    })

    mockCheckbox.mockResolvedValue(['Cursor'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-write-error', sid: 'session-write-error'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-write-error'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'token-write-error'})

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
    mockExistsSync.mockReturnValue(true)

    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          OtherServer: {
            type: 'stdio',
          },
        },
      }),
    )

    mockCheckbox.mockResolvedValue(['Cursor'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-merge', sid: 'session-merge'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-merge'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'merge-token-123'})

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
  })
})
