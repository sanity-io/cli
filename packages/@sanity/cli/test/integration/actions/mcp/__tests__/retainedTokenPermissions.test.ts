import fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {setupMCP} from '../../../../../src/actions/mcp/setupMCP.js'
import {type Editor} from '../../../../../src/actions/mcp/types.js'

const tokenConfig =
  '// keep this comment\n{"neighbor":true,"mcpServers":{"Sanity":{"headers":{"Authorization":"Bearer synthetic-retained-token"}}}}'
const oauthConfig = '{"mcpServers":{"Sanity":{"url":"https://mcp.sanity.io"}}}'
const output: Output = {
  error() {
    throw new Error('Unexpected fatal output')
  },
  log: vi.fn(),
  logDiagnostic: vi.fn(),
  logJson: vi.fn(),
  warn: vi.fn(),
}

const modeOf = async (file: string) => (await fs.stat(file)).mode & 0o777

// Windows DACLs are not POSIX modes; unit tests cover its explicit no-op path.
describe.skipIf(process.platform === 'win32')('retained MCP token permissions', () => {
  let directory: string
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'mcp-retained-permissions-'))
  })
  afterEach(async () => {
    vi.clearAllMocks()
    await fs.rm(directory, {force: true, recursive: true})
  })
  async function create(content = tokenConfig, mode = 0o644, name: Editor['name'] = 'Gemini CLI') {
    const configPath = path.join(directory, 'config')
    await fs.writeFile(configPath, content)
    await fs.chmod(configPath, mode)
    const editor: Editor = {configPath, configured: true, hasLegacyToken: true, name}
    return editor
  }

  test('restricts a retained JSONC token in auto mode without changing bytes or inode', async () => {
    const editor = await create()
    const before = await fs.stat(editor.configPath)
    const result = await setupMCP({editors: [editor], mode: 'auto', output})
    expect(await modeOf(editor.configPath)).toBe(0o600)
    expect(await fs.readFile(editor.configPath, 'utf8')).toBe(tokenConfig)
    expect((await fs.stat(editor.configPath)).ino).toBe(before.ino)
    expect(result.configuredEditors).toEqual([])
    expect(result.error).toBeUndefined()
    expect(result.skipped).toBe(false)
  })

  test('restricts a retained TOML http_headers token without rewriting its settings', async () => {
    const content =
      'model = "fixture"\n[mcp_servers.Sanity]\nurl = "https://mcp.sanity.io"\n[mcp_servers.Sanity.http_headers]\nAuthorization = "Bearer synthetic-retained-token"\n'
    const editor = await create(content, 0o640, 'Codex CLI')
    await setupMCP({editors: [editor], mode: 'auto', output})
    expect(await modeOf(editor.configPath)).toBe(0o600)
    expect(await fs.readFile(editor.configPath, 'utf8')).toBe(content)
  })

  test('removes other access without granting owner write permission', async () => {
    const editor = await create(tokenConfig, 0o444)
    await setupMCP({editors: [editor], mode: 'auto', output})
    expect(await modeOf(editor.configPath)).toBe(0o400)
    expect(await fs.readFile(editor.configPath, 'utf8')).toBe(tokenConfig)
  })

  test('preserves a valid symlink and restricts the opened target in place', async () => {
    const editor = await create()
    const link = path.join(directory, 'symlink')
    await fs.symlink(editor.configPath, link)
    const before = await fs.stat(editor.configPath)
    await setupMCP({editors: [{...editor, configPath: link}], mode: 'auto', output})
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true)
    expect(await modeOf(editor.configPath)).toBe(0o600)
    expect((await fs.stat(editor.configPath)).ino).toBe(before.ino)
  })

  test('leaves an already private token unchanged', async () => {
    const editor = await create(tokenConfig, 0o600)
    const result = await setupMCP({editors: [editor], mode: 'auto', output})
    expect(await modeOf(editor.configPath)).toBe(0o600)
    expect(await fs.readFile(editor.configPath, 'utf8')).toBe(tokenConfig)
    expect(result.skipped).toBe(true)
  })

  test('leaves a credential-free OAuth config mode unchanged', async () => {
    const editor = await create(oauthConfig)
    await setupMCP({editors: [{...editor, hasLegacyToken: false}], mode: 'auto', output})
    expect(await modeOf(editor.configPath)).toBe(0o644)
    expect(await fs.readFile(editor.configPath, 'utf8')).toBe(oauthConfig)
  })

  test('rechecks file contents when token detection metadata is stale', async () => {
    const editor = await create(oauthConfig)
    await setupMCP({editors: [editor], mode: 'auto', output})
    expect(await modeOf(editor.configPath)).toBe(0o644)
  })

  test('does not modify MCP files when MCP setup is skipped', async () => {
    const editor = await create()
    await setupMCP({editors: [editor], mode: 'skip', output})
    expect(await modeOf(editor.configPath)).toBe(0o644)
    expect(await fs.readFile(editor.configPath, 'utf8')).toBe(tokenConfig)
  })

  test('reports a missing retained config and still configures an independent OAuth editor', async () => {
    const missing: Editor = {
      configPath: path.join(directory, 'missing'),
      configured: true,
      hasLegacyToken: true,
      name: 'Gemini CLI',
    }
    const fresh: Editor = {
      configPath: path.join(directory, 'fresh.json'),
      configured: false,
      name: 'Cursor',
    }
    const result = await setupMCP({editors: [missing, fresh], mode: 'auto', output})
    expect(result.error).toBeInstanceOf(Error)
    expect(result.configuredEditors).toEqual(['Cursor'])
    expect(await fs.readFile(fresh.configPath, 'utf8')).not.toContain('synthetic-retained-token')
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('Could not restrict access'))
    await expect(fs.stat(missing.configPath)).rejects.toMatchObject({code: 'ENOENT'})
  })
})
