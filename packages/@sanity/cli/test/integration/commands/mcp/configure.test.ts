import {existsSync, type PathLike} from 'node:fs'
import fs from 'node:fs/promises'

import {checkbox} from '@sanity/cli-core/ux'
import {convertToSystemPath, createTestToken, testCommand} from '@sanity/cli-test'
import {execa} from 'execa'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ConfigureMcpCommand} from '../../../../src/commands/mcp/configure.js'

const mockCreateMCPToken = vi.hoisted(() => vi.fn())
const mockEnsureAuthenticated = vi.hoisted(() => vi.fn())
const mockIsInteractive = vi.hoisted(() => vi.fn().mockReturnValue(true))
const mockValidateMCPToken = vi.hoisted(() => vi.fn())

vi.mock('../../../../src/actions/auth/ensureAuthenticated.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/actions/auth/ensureAuthenticated.js')>()
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

vi.mock('../../../../src/services/mcp.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/services/mcp.js')>()
  return {
    ...actual,
    createMCPToken: mockCreateMCPToken,
    validateMCPToken: mockValidateMCPToken,
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

function mockMCPTokenCreation(token: string): void {
  mockCreateMCPToken.mockResolvedValueOnce(token)
}

// ---------------------------------------------------------------------------
// Helpers for table-driven per-editor tests
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------

describe.sequential('#mcp:configure', () => {
  beforeEach(async () => {
    mockEnsureAuthenticated.mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
      name: 'Test User',
      provider: 'github',
    })
    mockExistsSync.mockReturnValue(false)
    mockReadFile.mockResolvedValue('{}')
    mockWriteFile.mockResolvedValue()
    mockExeca.mockRejectedValue(new Error('Not installed'))
    mockCreateMCPToken.mockReset()
    mockValidateMCPToken.mockReset()
    createTestToken('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature')
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
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

    mockValidateMCPToken.mockResolvedValueOnce(true)

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    // Should NOT prompt the user — everything is already configured
    expect(mockCheckbox).not.toHaveBeenCalled()
    expect(stdout).toContain('All detected editors are already configured')
  })

  test('skips prompt for oauthOnly editor configured without a bearer token', async () => {
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

    // No /users/me mock — oauthOnly editors with no token skip validation entirely

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

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

    mockValidateMCPToken.mockResolvedValueOnce(false)

    mockCheckbox.mockResolvedValue(['Cursor'])

    // Cursor is oauthOnly so no new token is created — config is rewritten without a token

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

    mockValidateMCPToken.mockResolvedValueOnce(true)

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

    mockMCPTokenCreation('multi-token-123')

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockWriteFile).toHaveBeenCalledTimes(2)

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.cursor/mcp.json')),
      expect.not.stringContaining('multi-token-123'),
      'utf8',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('Code/User/mcp.json')),
      expect.stringContaining('multi-token-123'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Cursor, VS Code')
  })

  test('auto-selects all editors in non-interactive mode without prompting', async () => {
    mockIsInteractive.mockReturnValue(false)

    mockExeca.mockImplementation((async (command: string | URL) => {
      if (command === 'opencode') return EXECA_SUCCESS
      throw new Error('Not installed')
    }) as never)

    mockMCPTokenCreation('test-token-ci')

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).not.toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.config/opencode/opencode.json')),
      expect.stringContaining('test-token-ci'),
      'utf8',
    )
    expect(stdout).toContain('MCP configured for OpenCode')
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  test('handles token creation error gracefully', async () => {
    mockExeca.mockImplementation((async (command: string | URL) => {
      if (command === 'opencode') return EXECA_SUCCESS
      throw new Error('Not installed')
    }) as never)

    mockCheckbox.mockResolvedValue(['OpenCode'])

    mockCreateMCPToken.mockRejectedValueOnce(new Error('Not authenticated'))

    const {stderr} = await testCommand(ConfigureMcpCommand, [])

    expect(stderr).toContain('Could not configure MCP')
    expect(stderr).toContain('https://mcp.sanity.io')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  test('handles file write error gracefully', async () => {
    mockExeca.mockImplementation((async (command: string | URL) => {
      if (command === 'opencode') return EXECA_SUCCESS
      throw new Error('Not installed')
    }) as never)

    mockCheckbox.mockResolvedValue(['OpenCode'])

    mockMCPTokenCreation('token-write-error')

    mockWriteFile.mockRejectedValue(new Error('Permission denied'))

    const {stderr} = await testCommand(ConfigureMcpCommand, [])

    expect(stderr).toContain('Could not configure MCP')
    expect(stderr).toContain('https://mcp.sanity.io')
  })

  test('suggests login when login fails', async () => {
    const {LoginError} = await import('../../../../src/errors/LoginError.js')
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
    mockExeca.mockImplementation((async (command: string | URL) => {
      if (command === 'opencode') return EXECA_SUCCESS
      throw new Error('Not installed')
    }) as never)

    mockExistsSync.mockImplementation((p: PathLike) => {
      return String(p).endsWith('opencode.json')
    })

    mockReadFile.mockResolvedValue(
      JSON.stringify({
        mcp: {
          OtherServer: {
            type: 'stdio',
          },
        },
      }),
    )

    mockCheckbox.mockResolvedValue(['OpenCode'])

    mockMCPTokenCreation('merge-token-123')

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
