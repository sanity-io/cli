import {existsSync, type PathLike} from 'node:fs'
import fs from 'node:fs/promises'

import {runCommand} from '@oclif/test'
import {checkbox} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import {execa} from 'execa'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {MCP_API_VERSION} from '../../../services/mcp.js'
import {ConfigureMcpCommand} from '../configure.js'

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

describe('#mcp:configure', () => {
  beforeEach(async () => {
    mockExistsSync.mockReturnValue(false)
    mockWriteFile.mockResolvedValue()
    mockExeca.mockRejectedValue(new Error('Not installed'))
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['mcp configure', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Configure Sanity MCP server for AI editors (Cursor, VS Code, Claude Code)

      USAGE
        $ sanity mcp configure

      DESCRIPTION
        Configure Sanity MCP server for AI editors (Cursor, VS Code, Claude Code)

      EXAMPLES
        Configure Sanity MCP server for detected AI editors

          $ sanity mcp configure

      "
    `)
  })

  test('shows warning when no editors are detected', async () => {
    // No editors detected (all checks fail)
    mockExistsSync.mockReturnValue(false)
    mockExeca.mockRejectedValue(new Error('Not installed'))

    const {stderr, stdout} = await testCommand(ConfigureMcpCommand, [])
    const output = stdout + stderr

    expect(output).toContain('No supported AI editors detected')
    expect(output).toContain('https://mcp.sanity.io')
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
      expect.stringContaining('.cursor/mcp.json'),
      expect.stringContaining('test-token-123'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Cursor')
  })

  test('detects VS Code on macOS and configures it', async () => {
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
  })

  test('detects Claude Code via CLI and configures it', async () => {
    mockExeca.mockResolvedValue({
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

    expect(mockExeca).toHaveBeenCalledWith('claude', ['--version'], {
      stdio: 'pipe',
      timeout: 5000,
    })

    expect(mockCheckbox).toHaveBeenCalledWith({
      choices: [
        {
          checked: true,
          name: 'Claude Code',
          value: 'Claude Code',
        },
      ],
      message: 'Configure Sanity MCP server?',
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.claude.json'),
      expect.stringContaining('test-token-789'),
      'utf8',
    )

    expect(stdout).toContain('MCP configured for Claude Code')
  })

  test('shows already installed status for configured editors', async () => {
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

    mockCheckbox.mockResolvedValue(['Cursor'])

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
          checked: false, // Not pre-selected since already configured
          name: 'Cursor (already installed)',
          value: 'Cursor',
        },
      ],
      message: 'Configure Sanity MCP server?',
    })
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
