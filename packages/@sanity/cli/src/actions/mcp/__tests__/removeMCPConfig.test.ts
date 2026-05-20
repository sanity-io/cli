import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {type Editor} from '../types.js'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    default: {
      ...actual,
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
  }
})

const mockExistsSync = vi.mocked(existsSync)
const mockReadFile = vi.mocked(fs.readFile)
const mockWriteFile = vi.mocked(fs.writeFile)

const {removeMCPConfig} = await import('../removeMCPConfig.js')

function makeEditor(overrides: Partial<Editor> & Pick<Editor, 'name'>): Editor {
  return {
    configPath: `/fake/${overrides.name}/config.json`,
    configured: true,
    ...overrides,
  }
}

function expectWrittenConfigWithoutSanity(): void {
  expect(mockWriteFile).toHaveBeenCalledTimes(1)
  const writtenContent = mockWriteFile.mock.calls[0]?.[1]
  expect(writtenContent).toEqual(expect.any(String))
  expect(writtenContent as string).toContain('OtherServer')
  expect(writtenContent as string).not.toContain('Sanity')
}

describe('removeMCPConfig', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('removes only the Sanity JSONC server entry', async () => {
    mockExistsSync.mockReturnValue(true)
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

    await removeMCPConfig(makeEditor({name: 'Cursor'}))

    expectWrittenConfigWithoutSanity()
  })

  test('removes only the Sanity TOML server entry', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(`
[mcp_servers.OtherServer]
type = "stdio"

[mcp_servers.Sanity]
type = "http"
url = "https://mcp.sanity.io"
`)

    await removeMCPConfig(makeEditor({configPath: '/fake/codex/config.toml', name: 'Codex CLI'}))

    expectWrittenConfigWithoutSanity()
  })

  test('does not write when the config file does not exist', async () => {
    mockExistsSync.mockReturnValue(false)

    await removeMCPConfig(makeEditor({name: 'Cursor'}))

    expect(mockReadFile).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})
