import {constants} from 'node:fs'
import fs from 'node:fs/promises'

import {type ParseError, parse as parseJsonc} from 'jsonc-parser'
import {parse as parseToml} from 'smol-toml'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {hasLegacyToken} from '../editorConfigs.js'
import {protectLegacyMCPConfig} from '../protectLegacyMCPConfig.js'
import {type Editor} from '../types.js'

const mocks = vi.hoisted(() => ({
  chmod: vi.fn(),
  close: vi.fn(),
  hasLegacyToken: vi.fn(),
  open: vi.fn(),
  parseJsonc: vi.fn(),
  parseToml: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}))
vi.mock('node:fs', () => ({constants: {O_NONBLOCK: 2048, O_RDONLY: 0}}))
vi.mock('node:fs/promises', () => ({default: {open: mocks.open}}))
vi.mock('jsonc-parser', () => ({parse: mocks.parseJsonc}))
vi.mock('smol-toml', () => ({parse: mocks.parseToml}))
vi.mock('../editorConfigs.js', () => ({
  EDITOR_CONFIGS: {
    'Codex CLI': {configKey: 'mcp_servers', format: 'toml'},
    'Gemini CLI': {configKey: 'mcpServers', format: 'jsonc'},
  },
  hasLegacyToken: mocks.hasLegacyToken,
}))
const editor: Editor = {
  configPath: '/fixture/config',
  configured: true,
  hasLegacyToken: true,
  name: 'Gemini CLI',
}
const file = {chmod: mocks.chmod, close: mocks.close, readFile: mocks.readFile, stat: mocks.stat}
const state = {stat: {isFile: () => true, mode: 0o644, uid: 1000}}

beforeEach(() => {
  vi.stubGlobal('process', {...process, getuid: () => 1000, platform: 'linux'})
  mocks.open.mockResolvedValue(file)
  state.stat = {isFile: () => true, mode: 0o644, uid: 1000}
  mocks.stat.mockImplementation(async () => state.stat)
  mocks.readFile.mockResolvedValue('fixture config')
  mocks.parseJsonc.mockReturnValue({
    mcpServers: {Sanity: {headers: {Authorization: 'Bearer fixture'}}},
  })
  mocks.parseToml.mockReturnValue({
    mcp_servers: {Sanity: {http_headers: {Authorization: 'Bearer fixture'}}},
  })
  mocks.hasLegacyToken.mockReturnValue(true)
  mocks.chmod.mockImplementation(async (mode: number) => {
    state.stat.mode = mode
  })
  mocks.close.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('protectLegacyMCPConfig', () => {
  test('opens without creation/blocking, checks the descriptor and only removes access', async () => {
    await expect(protectLegacyMCPConfig(editor)).resolves.toBe(true)
    expect(fs.open).toHaveBeenCalledWith(
      editor.configPath,
      constants.O_RDONLY | constants.O_NONBLOCK,
    )
    expect(parseJsonc).toHaveBeenCalledWith('fixture config', [], {allowTrailingComma: true})
    expect(hasLegacyToken).toHaveBeenCalledWith({headers: {Authorization: 'Bearer fixture'}})
    expect(mocks.chmod).toHaveBeenCalledWith(0o600)
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  test('reports a successful no-op chmod instead of claiming protection', async () => {
    mocks.chmod.mockResolvedValueOnce(undefined)
    await expect(protectLegacyMCPConfig(editor)).rejects.toThrow(
      'Filesystem did not restrict access to the saved-token MCP configuration',
    )
    expect(mocks.chmod).toHaveBeenCalledWith(0o600)
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  test('never adds owner write permission', async () => {
    state.stat.mode = 0o464
    await protectLegacyMCPConfig(editor)
    expect(mocks.chmod).toHaveBeenCalledWith(0o400)
  })
  test('leaves already private files untouched', async () => {
    mocks.stat.mockResolvedValue({isFile: () => true, mode: 0o600, uid: 1000})
    await expect(protectLegacyMCPConfig(editor)).resolves.toBe(false)
    expect(mocks.readFile).not.toHaveBeenCalled()
    expect(mocks.chmod).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  test('does not open a config without a detected legacy token', async () => {
    await expect(protectLegacyMCPConfig({...editor, hasLegacyToken: false})).resolves.toBe(false)
    expect(mocks.open).not.toHaveBeenCalled()
  })
  test('does not apply POSIX modes on Windows', async () => {
    vi.stubGlobal('process', {...process, platform: 'win32'})
    await expect(protectLegacyMCPConfig(editor)).resolves.toBe(false)
    expect(mocks.open).not.toHaveBeenCalled()
  })
  test('does not apply POSIX modes without a user ID', async () => {
    vi.stubGlobal('process', {...process, getuid: undefined})
    await expect(protectLegacyMCPConfig(editor)).resolves.toBe(false)
    expect(mocks.open).not.toHaveBeenCalled()
  })
  test('rejects non-regular files and closes the descriptor', async () => {
    mocks.stat.mockResolvedValue({isFile: () => false, mode: 0o644, uid: 1000})
    await expect(protectLegacyMCPConfig(editor)).rejects.toThrow(
      'regular file owned by the current user',
    )
    expect(mocks.chmod).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  test('does not change a file owned by another user', async () => {
    mocks.stat.mockResolvedValue({isFile: () => true, mode: 0o644, uid: 1001})
    await expect(protectLegacyMCPConfig(editor)).rejects.toThrow('owned by the current user')
    expect(mocks.readFile).not.toHaveBeenCalled()
    expect(mocks.chmod).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  test('does not close a descriptor it never opened', async () => {
    mocks.open.mockRejectedValueOnce(new Error('open failed'))
    await expect(protectLegacyMCPConfig(editor)).rejects.toThrow('open failed')
    expect(mocks.close).not.toHaveBeenCalled()
  })
  test.each(['stat', 'readFile', 'chmod'] as const)(
    'closes after a %s failure',
    async (operation) => {
      mocks[operation].mockRejectedValueOnce(new Error('fixture failure'))
      await expect(protectLegacyMCPConfig(editor)).rejects.toThrow('fixture failure')
      expect(mocks.close).toHaveBeenCalledOnce()
    },
  )
  test('revalidates TOML using the editor config key', async () => {
    await expect(protectLegacyMCPConfig({...editor, name: 'Codex CLI'})).resolves.toBe(true)
    expect(parseToml).toHaveBeenCalledWith('fixture config')
    expect(parseJsonc).not.toHaveBeenCalled()
    expect(hasLegacyToken).toHaveBeenCalledWith({http_headers: {Authorization: 'Bearer fixture'}})
  })
  test('does not expose JSONC parser diagnostics', async () => {
    mocks.parseJsonc.mockImplementationOnce((_text: string, errors: ParseError[]) => {
      errors.push({error: 1, length: 1, offset: 0})
      return {}
    })
    await expect(protectLegacyMCPConfig(editor)).rejects.toThrow(
      'Could not parse the saved-token MCP configuration',
    )
    expect(mocks.chmod).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  test('does not expose TOML parser diagnostics', async () => {
    mocks.parseToml.mockImplementationOnce(() => {
      throw new Error('diagnostic includes a synthetic credential')
    })
    await expect(protectLegacyMCPConfig({...editor, name: 'Codex CLI'})).rejects.toThrow(
      'Could not parse the saved-token MCP configuration',
    )
    expect(mocks.chmod).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  test.each(
    [null, [], {mcpServers: []}, {mcpServers: {Sanity: []}}, {mcpServers: {Other: {}}}].map(
      (config) => ({config}),
    ),
  )('does not modify a stale config shape $config', async ({config}) => {
    mocks.parseJsonc.mockReturnValueOnce(config)
    await expect(protectLegacyMCPConfig(editor)).resolves.toBe(false)
    expect(mocks.chmod).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  test('does not modify a config whose token was removed since detection', async () => {
    mocks.hasLegacyToken.mockReturnValueOnce(false)
    await expect(protectLegacyMCPConfig(editor)).resolves.toBe(false)
    expect(mocks.chmod).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
})
