import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {removeMCPConfig} from '../removeMCPConfig.js'
import {type Editor} from '../types.js'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    default: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  }
})

const mockExistsSync = vi.mocked(existsSync)
const mockReadFile = vi.mocked(fs.readFile)
const mockWriteFile = vi.mocked(fs.writeFile)

function makeEditor(overrides: Partial<Editor> & {name: Editor['name']}): Editor {
  return {configPath: `/home/user/.config/${overrides.name}`, configured: true, ...overrides}
}

/** The content written to disk in the single expected writeFile call. */
function writtenContent(): string {
  expect(mockWriteFile).toHaveBeenCalledTimes(1)
  return mockWriteFile.mock.calls[0]?.[1] as string
}

describe('removeMCPConfig', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('no-ops when the config file does not exist', async () => {
    mockExistsSync.mockReturnValue(false)

    await removeMCPConfig(makeEditor({name: 'Cursor'}))

    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  test('no-ops when the config file is empty or whitespace', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue('   \n  ')

    await removeMCPConfig(makeEditor({name: 'Cursor'}))

    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  test('removes the Sanity entry from a JSONC config while preserving other servers', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(
      JSON.stringify(
        {
          mcpServers: {
            Other: {type: 'http', url: 'https://other.example'},
            Sanity: {type: 'http', url: 'https://mcp.sanity.io'},
          },
        },
        null,
        2,
      ),
    )

    await removeMCPConfig(makeEditor({name: 'Cursor'}))

    const written = writtenContent()
    expect(written).not.toContain('Sanity')
    expect(written).toContain('Other')
    expect(written).toContain('https://other.example')
  })

  test('preserves comments in a JSONC config when removing the Sanity entry', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(
      `{
  // keep this comment
  "mcpServers": {
    "Other": {"type": "http", "url": "https://other.example"},
    "Sanity": {"type": "http", "url": "https://mcp.sanity.io"}
  }
}`,
    )

    await removeMCPConfig(makeEditor({name: 'Cursor'}))

    const written = writtenContent()
    expect(written).toContain('// keep this comment')
    expect(written).not.toContain('Sanity')
  })

  test('no-ops when the JSONC config has no Sanity entry', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(
      JSON.stringify({mcpServers: {Other: {type: 'http', url: 'https://other.example'}}}),
    )

    await removeMCPConfig(makeEditor({name: 'Cursor'}))

    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  test('no-ops when the JSONC config has unrelated keys and no server map', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(JSON.stringify({somethingElse: true}))

    await removeMCPConfig(makeEditor({name: 'Cursor'}))

    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  test('removes the Sanity entry from a TOML config while preserving other servers', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(
      [
        '[mcp_servers.Other]',
        'type = "http"',
        'url = "https://other.example"',
        '',
        '[mcp_servers.Sanity]',
        'type = "http"',
        'url = "https://mcp.sanity.io"',
        '',
      ].join('\n'),
    )

    await removeMCPConfig(makeEditor({name: 'Codex CLI'}))

    const written = writtenContent()
    expect(written).not.toContain('Sanity')
    expect(written).toContain('Other')
    expect(written).toContain('https://other.example')
  })

  test('no-ops when the TOML config has no Sanity entry', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(
      ['[mcp_servers.Other]', 'type = "http"', 'url = "https://other.example"', ''].join('\n'),
    )

    await removeMCPConfig(makeEditor({name: 'Codex CLI'}))

    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})
