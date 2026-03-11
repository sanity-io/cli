import {readFile} from 'node:fs/promises'

import {getCliConfig} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {extractAppManifest} from '../extractAppManifest.js'

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getCliConfig: vi.fn(),
  }
})

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    spinner: vi.fn(() => ({fail: vi.fn(), start: vi.fn().mockReturnThis(), succeed: vi.fn()})),
  }
})

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockReadFile = vi.mocked(readFile)

describe('extractAppManifest', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns undefined when no app config', async () => {
    mockGetCliConfig.mockResolvedValue({app: undefined} as never)
    const result = await extractAppManifest({workDir: '/project'})
    expect(result).toBeUndefined()
  })

  test('returns manifest with title only when app has no icon', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {organizationId: 'org-1', title: 'My App'},
    } as never)

    const result = await extractAppManifest({workDir: '/project'})

    expect(result).toEqual({title: 'My App', version: '1'})
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('reads icon from file path and inlines in manifest', async () => {
    const workDir = '/project'
    mockGetCliConfig.mockResolvedValue({
      app: {icon: 'public/icon.svg', organizationId: 'org-1', title: 'My App'},
    } as never)
    mockReadFile.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')

    const result = await extractAppManifest({workDir})

    expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('icon.svg'), 'utf8')
    expect(result?.icon).toMatch(/<svg[\s>]/i)
    expect(result?.icon).toContain('path')
    expect(result?.title).toBe('My App')
  })

  test('rejects icon path that resolves outside project directory', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {icon: '../../../etc/passwd', organizationId: 'org-1'},
    } as never)

    await expect(extractAppManifest({workDir: '/project'})).rejects.toThrow(
      /resolves outside the project directory/,
    )

    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('throws when file content does not look like SVG', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {icon: 'public/icon.txt', organizationId: 'org-1'},
    } as never)
    mockReadFile.mockResolvedValue('hello world')

    await expect(extractAppManifest({workDir: '/project'})).rejects.toThrow(
      /does not contain an SVG element/,
    )
  })

  test('throws with clear message when icon file cannot be read', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {icon: 'missing.svg', organizationId: 'org-1'},
    } as never)
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'))

    await expect(extractAppManifest({workDir: '/project'})).rejects.toThrow(
      /Could not read icon file at "missing.svg"/,
    )
  })
})
