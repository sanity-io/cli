import {existsSync, type PathLike} from 'node:fs'
import fs from 'node:fs/promises'

import {checkbox} from '@sanity/cli-core/ux'
import {convertToSystemPath, createTestToken, mockApi, testCommand} from '@sanity/cli-test'
import spawn from 'nano-spawn'
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

vi.mock('nano-spawn', () => ({
  default: vi.fn(),
}))

const mockCheckbox = vi.mocked(checkbox)
const mockExistsSync = vi.mocked(existsSync)
const mockReadFile = vi.mocked(fs.readFile)
const mockWriteFile = vi.mocked(fs.writeFile)
const mockSpawn = vi.mocked(spawn)

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
    mockSpawn.mockRejectedValue(new Error('Not installed'))
    createTestToken('test-token')
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('shows warning when no editors are detected', async () => {
    // No editors detected (all checks fail)
    mockExistsSync.mockReturnValue(false)
    mockSpawn.mockRejectedValue(new Error('Not installed'))

    const {error, stderr} = await testCommand(ConfigureMcpCommand, [])

    if (error) throw error

    expect(stderr).toContain("Couldn't auto-configure Sanity MCP server for your editor")
    expect(stderr).toContain('https://mcp.sanity.io')
  })

  test('detects Cursor and configures it', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
    })

    mockCheckbox.mockResolvedValue(['Cursor'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-123', sid: 'session-123'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-123'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'test-token-123'})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {
          checked: true,
          name: 'Cursor',
          value: 'Cursor',
        },
      ],
      message: 'Configure Sanity MCP server?',
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.cursor/mcp.json')),
      expect.stringContaining('test-token-123'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Cursor')
  })

  test.runIf(process.platform === 'darwin')(
    'detects VS Code on macOS and configures it',
    async () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      })

      mockExistsSync.mockImplementation((path: PathLike) => {
        return String(path).includes('Library/Application Support/Code/User')
      })

      mockCheckbox.mockResolvedValue(['VS Code'])

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'post',
        uri: '/auth/session/create',
      }).reply(200, {id: 'session-456', sid: 'session-456'})

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'get',
        query: {sid: 'session-456'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'MCP Token', token: 'test-token-456'})

      const {stdout} = await testCommand(ConfigureMcpCommand, [])

      expect(mockCheckbox).toHaveBeenCalledWith({
        choices: [
          {
            checked: true,
            name: 'VS Code',
            value: 'VS Code',
          },
        ],
        message: 'Configure Sanity MCP server?',
      })

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('Code/User/mcp.json'),
        expect.stringContaining('test-token-456'),
        'utf8',
      )

      expect(stdout).toContain('MCP configured for VS Code')

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      })
    },
  )

  test.runIf(process.platform === 'win32')(
    'detects VS Code on Windows and configures it',
    async () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      })

      mockExistsSync.mockImplementation((path: PathLike) => {
        return String(path).includes(String.raw`AppData\Roaming\Code\User`)
      })

      mockCheckbox.mockResolvedValue(['VS Code'])

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'post',
        uri: '/auth/session/create',
      }).reply(200, {id: 'session-456', sid: 'session-456'})

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'get',
        query: {sid: 'session-456'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'MCP Token', token: 'test-token-456'})

      const {stdout} = await testCommand(ConfigureMcpCommand, [])

      expect(mockCheckbox).toHaveBeenCalledWith({
        choices: [
          {
            checked: true,
            name: 'VS Code',
            value: 'VS Code',
          },
        ],
        message: 'Configure Sanity MCP server?',
      })

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining(String.raw`AppData\Roaming\Code\User\mcp.json`),
        expect.stringContaining('test-token-456'),
        'utf8',
      )

      expect(stdout).toContain('MCP configured for VS Code')

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      })
    },
  )

  test('detects Claude Code via CLI and configures it', async () => {
    mockSpawn.mockResolvedValue({
      command: 'claude --version',
      exitCode: 0,
      failed: false,
      killed: false,
      signal: undefined,
      stderr: '',
      stdout: '1.0.0',
      timedOut: false,
    } as never)

    mockCheckbox.mockResolvedValue(['Claude Code'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-789', sid: 'session-789'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-789'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'test-token-789'})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockSpawn).toHaveBeenCalledWith('claude', ['--version'], {
      stdio: 'pipe',
      timeout: 5000,
    })

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: expect.arrayContaining([
        {
          checked: true,
          name: 'Claude Code',
          value: 'Claude Code',
        },
      ]),
      message: 'Configure Sanity MCP server?',
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.claude.json'),
      expect.stringContaining('test-token-789'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Claude Code')
  })

  test('detects Gemini CLI and configures it', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.gemini')
    })

    mockCheckbox.mockResolvedValue(['Gemini CLI'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-gemini', sid: 'session-gemini'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-gemini'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'test-token-gemini'})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {
          checked: true,
          name: 'Gemini CLI',
          value: 'Gemini CLI',
        },
      ],
      message: 'Configure Sanity MCP server?',
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.gemini/settings.json')),
      expect.stringContaining('test-token-gemini'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Gemini CLI')
  })

  test('detects GitHub Copilot CLI and configures it with tools field', async () => {
    // Match both ~/.copilot and $XDG_CONFIG_HOME/copilot across platforms
    mockExistsSync.mockImplementation((p: PathLike) => {
      const normalizedPath = String(p).replaceAll('\\', '/')
      return /\/.?copilot(?:\/|$)/.test(normalizedPath)
    })

    mockCheckbox.mockResolvedValue(['GitHub Copilot CLI'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-copilot', sid: 'session-copilot'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-copilot'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'test-token-copilot'})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {
          checked: true,
          name: 'GitHub Copilot CLI',
          value: 'GitHub Copilot CLI',
        },
      ],
      message: 'Configure Sanity MCP server?',
    })

    const writtenContent = mockWriteFile.mock.calls[0]?.[1] as string
    expect(writtenContent).toContain('test-token-copilot')
    expect(writtenContent).toContain('"tools"')
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('mcp-config.json'),
      expect.any(String),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for GitHub Copilot CLI')
  })

  test.runIf(process.platform === 'linux')(
    'detects GitHub Copilot CLI via XDG_CONFIG_HOME on Linux',
    async () => {
      const originalXdg = process.env.XDG_CONFIG_HOME
      process.env.XDG_CONFIG_HOME = '/home/user/.config'

      mockExistsSync.mockImplementation((p: PathLike) => {
        return String(p).includes('/home/user/.config/copilot')
      })

      mockCheckbox.mockResolvedValue(['GitHub Copilot CLI'])

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'post',
        uri: '/auth/session/create',
      }).reply(200, {id: 'session-copilot-xdg', sid: 'session-copilot-xdg'})

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'get',
        query: {sid: 'session-copilot-xdg'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'MCP Token', token: 'test-token-copilot-xdg'})

      const {stdout} = await testCommand(ConfigureMcpCommand, [])

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('/home/user/.config/copilot/mcp-config.json'),
        expect.stringContaining('test-token-copilot-xdg'),
        'utf8',
      )

      expect(stdout).toContain('MCP configured for GitHub Copilot CLI')

      process.env.XDG_CONFIG_HOME = originalXdg
    },
  )

  test.runIf(process.platform === 'darwin')(
    'detects OpenCode via CLI on macOS and configures it',
    async () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      })

      mockSpawn.mockResolvedValue({
        command: 'opencode --version',
        exitCode: 0,
        failed: false,
        killed: false,
        signal: undefined,
        stderr: '',
        stdout: '1.0.0',
        timedOut: false,
      } as never)

      mockCheckbox.mockResolvedValue(['OpenCode'])

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'post',
        uri: '/auth/session/create',
      }).reply(200, {id: 'session-opencode', sid: 'session-opencode'})

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'get',
        query: {sid: 'session-opencode'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'MCP Token', token: 'test-token-opencode'})

      const {stdout} = await testCommand(ConfigureMcpCommand, [])

      expect(mockSpawn).toHaveBeenCalledWith('opencode', ['--version'], {
        stdio: 'pipe',
        timeout: 5000,
      })

      expect(mockCheckbox).toHaveBeenCalledWith({
        choices: expect.arrayContaining([
          {
            checked: true,
            name: 'OpenCode',
            value: 'OpenCode',
          },
        ]),
        message: 'Configure Sanity MCP server?',
      })

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('.config/opencode/opencode.json'),
        expect.stringContaining('test-token-opencode'),
        'utf8',
      )

      expect(stdout).toContain('MCP configured for OpenCode')

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      })
    },
  )

  test('detects Codex CLI via CLI and configures TOML with headers', async () => {
    mockSpawn.mockImplementation((async (command: string | URL) => {
      if (command === 'codex') {
        return {
          command: 'codex --version',
          exitCode: 0,
          failed: false,
          killed: false,
          signal: undefined,
          stderr: '',
          stdout: '1.0.0',
          timedOut: false,
        } as never
      }

      throw new Error('Not installed')
    }) as never)

    mockCheckbox.mockResolvedValue(['Codex CLI'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-codex', sid: 'session-codex'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-codex'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'test-token-codex'})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockSpawn).toHaveBeenCalledWith('codex', ['--version'], {
      stdio: 'pipe',
      timeout: 5000,
    })

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {
          checked: true,
          name: 'Codex CLI',
          value: 'Codex CLI',
        },
      ],
      message: 'Configure Sanity MCP server?',
    })

    const writtenContent = mockWriteFile.mock.calls[0]?.[1] as string
    expect(writtenContent).toContain('[mcp_servers.Sanity]')
    expect(writtenContent).toContain('[mcp_servers.Sanity.http_headers]')
    expect(writtenContent).toContain('Authorization = "Bearer test-token-codex"')

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(convertToSystemPath('.codex/config.toml')),
      expect.any(String),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Codex CLI')
  })

  test('uses CODEX_HOME when configuring Codex CLI', async () => {
    const originalCodexHome = process.env.CODEX_HOME
    process.env.CODEX_HOME = '/tmp/custom-codex-home'
    try {
      mockSpawn.mockImplementation((async (command: string | URL) => {
        if (command === 'codex') {
          return {
            command: 'codex --version',
            exitCode: 0,
            failed: false,
            killed: false,
            signal: undefined,
            stderr: '',
            stdout: '1.0.0',
            timedOut: false,
          } as never
        }

        throw new Error('Not installed')
      }) as never)

      mockCheckbox.mockResolvedValue(['Codex CLI'])

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'post',
        uri: '/auth/session/create',
      }).reply(200, {id: 'session-codex-home', sid: 'session-codex-home'})

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'get',
        query: {sid: 'session-codex-home'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'MCP Token', token: 'test-token-codex-home'})

      const {stdout} = await testCommand(ConfigureMcpCommand, [])

      const writtenPath = mockWriteFile.mock.calls[0]?.[0] as string
      expect(writtenPath.replaceAll('\\', '/')).toMatch(/\/tmp\/custom-codex-home\/config\.toml$/)
      expect(mockWriteFile).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'utf8')

      expect(stdout).toContain('MCP configured for Codex CLI')
    } finally {
      process.env.CODEX_HOME = originalCodexHome
    }
  })

  test('skips Codex CLI when existing TOML config is unparseable', async () => {
    mockSpawn.mockImplementation((async (command: string | URL) => {
      if (command === 'codex') {
        return {
          command: 'codex --version',
          exitCode: 0,
          failed: false,
          killed: false,
          signal: undefined,
          stderr: '',
          stdout: '1.0.0',
          timedOut: false,
        } as never
      }

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

  test.runIf(process.platform === 'darwin')(
    'detects VS Code Insiders on macOS and configures it',
    async () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      })

      mockExistsSync.mockImplementation((path: PathLike) => {
        return String(path).includes('Library/Application Support/Code - Insiders/User')
      })

      mockCheckbox.mockResolvedValue(['VS Code Insiders'])

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'post',
        uri: '/auth/session/create',
      }).reply(200, {id: 'session-insiders', sid: 'session-insiders'})

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'get',
        query: {sid: 'session-insiders'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'MCP Token', token: 'test-token-insiders'})

      const {stdout} = await testCommand(ConfigureMcpCommand, [])

      expect(mockCheckbox).toHaveBeenCalledWith({
        choices: [
          {
            checked: true,
            name: 'VS Code Insiders',
            value: 'VS Code Insiders',
          },
        ],
        message: 'Configure Sanity MCP server?',
      })

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('Code - Insiders/User/mcp.json'),
        expect.stringContaining('test-token-insiders'),
        'utf8',
      )

      expect(stdout).toContain('MCP configured for VS Code Insiders')

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      })
    },
  )

  test.runIf(process.platform === 'win32')(
    'detects VS Code Insiders on Windows and configures it',
    async () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      })

      mockExistsSync.mockImplementation((path: PathLike) => {
        return String(path).includes(String.raw`AppData\Roaming\Code - Insiders\User`)
      })

      mockCheckbox.mockResolvedValue(['VS Code Insiders'])

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'post',
        uri: '/auth/session/create',
      }).reply(200, {id: 'session-insiders', sid: 'session-insiders'})

      mockApi({
        apiVersion: MCP_API_VERSION,
        method: 'get',
        query: {sid: 'session-insiders'},
        uri: '/auth/fetch',
      }).reply(200, {label: 'MCP Token', token: 'test-token-insiders'})

      const {stdout} = await testCommand(ConfigureMcpCommand, [])

      expect(mockCheckbox).toHaveBeenCalledWith({
        choices: [
          {
            checked: true,
            name: 'VS Code Insiders',
            value: 'VS Code Insiders',
          },
        ],
        message: 'Configure Sanity MCP server?',
      })

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining(String.raw`AppData\Roaming\Code - Insiders\User\mcp.json`),
        expect.stringContaining('test-token-insiders'),
        'utf8',
      )

      expect(stdout).toContain('MCP configured for VS Code Insiders')

      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      })
    },
  )

  test.runIf(process.platform === 'darwin')('detects Zed on macOS and configures it', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    })

    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.config/zed')
    })

    mockCheckbox.mockResolvedValue(['Zed'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-zed', sid: 'session-zed'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-zed'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'test-token-zed'})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {
          checked: true,
          name: 'Zed',
          value: 'Zed',
        },
      ],
      message: 'Configure Sanity MCP server?',
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.config/zed/settings.json'),
      expect.stringContaining('test-token-zed'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Zed')

    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
  })

  test.runIf(process.platform === 'win32')('detects Zed on Windows and configures it', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    })

    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes(String.raw`AppData\Roaming\Zed`)
    })

    mockCheckbox.mockResolvedValue(['Zed'])

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'post',
      uri: '/auth/session/create',
    }).reply(200, {id: 'session-zed', sid: 'session-zed'})

    mockApi({
      apiVersion: MCP_API_VERSION,
      method: 'get',
      query: {sid: 'session-zed'},
      uri: '/auth/fetch',
    }).reply(200, {label: 'MCP Token', token: 'test-token-zed'})

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {
          checked: true,
          name: 'Zed',
          value: 'Zed',
        },
      ],
      message: 'Configure Sanity MCP server?',
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(String.raw`AppData\Roaming\Zed\settings.json`),
      expect.stringContaining('test-token-zed'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Zed')

    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
  })

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
      const p = String(path)
      return p.includes('.cursor') || p.includes('.gemini')
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

  test('exits gracefully when user deselects all editors', async () => {
    mockExistsSync.mockImplementation((path: PathLike) => {
      return String(path).includes('.cursor')
    })

    mockCheckbox.mockResolvedValue([])

    const {stdout} = await testCommand(ConfigureMcpCommand, [])

    expect(stdout).toContain('MCP configuration skipped')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

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
})
