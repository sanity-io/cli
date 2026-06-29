import {afterEach, describe, expect, test, vi} from 'vitest'

import {extractCoreAppManifest, resolveTitleUpdate} from '../extractCoreAppManifest.js'
import {type CoreAppManifest} from '../types.js'

const mockGetCliConfig = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/config', () => ({
  getCliConfigUncached: mockGetCliConfig,
}))

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}))

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    spinner: vi.fn(() => ({fail: vi.fn(), start: vi.fn().mockReturnThis(), succeed: vi.fn()})),
  }
})

describe('extractCoreAppManifest', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns undefined when no app config', async () => {
    mockGetCliConfig.mockResolvedValue({app: undefined} as never)
    const result = await extractCoreAppManifest({workDir: '/project'})
    expect(result).toBeUndefined()
  })

  test('returns manifest with title only when app has no icon', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {organizationId: 'org-1', title: 'My App'},
    } as never)

    const result = await extractCoreAppManifest({workDir: '/project'})

    expect(result).toEqual({title: 'My App', version: '1'})
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('merges group and priority into the manifest', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {group: 'dock.system', organizationId: 'org-1', priority: 20, title: 'My App'},
    } as never)

    const result = await extractCoreAppManifest({workDir: '/project'})

    expect(result).toEqual({group: 'dock.system', priority: 20, title: 'My App', version: '1'})
  })

  test('keeps priority 0 (not dropped as a falsy value)', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {organizationId: 'org-1', priority: 0, title: 'My App'},
    } as never)

    const result = await extractCoreAppManifest({workDir: '/project'})

    expect(result?.priority).toBe(0)
  })

  test('reads icon from file path and inlines in manifest', async () => {
    const workDir = '/project'
    mockGetCliConfig.mockResolvedValue({
      app: {icon: 'public/icon.svg', organizationId: 'org-1', title: 'My App'},
    } as never)
    mockReadFile.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')

    const result = await extractCoreAppManifest({workDir})

    expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('icon.svg'), 'utf8')
    expect(result?.icon).toMatch(/<svg[\s>]/i)
    expect(result?.icon).toContain('path')
    expect(result?.title).toBe('My App')
  })

  test('sanitizes the icon SVG before inlining it', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {icon: 'public/icon.svg', organizationId: 'org-1', title: 'My App'},
    } as never)
    mockReadFile.mockResolvedValue(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><path d="M0 0"/></svg>',
    )

    const result = await extractCoreAppManifest({workDir: '/project'})

    expect(result?.icon).not.toContain('<script>')
    expect(result?.icon).toContain('<path')
  })

  test('rejects icon path that resolves outside project directory', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {icon: '../../../etc/passwd', organizationId: 'org-1'},
    } as never)

    await expect(extractCoreAppManifest({workDir: '/project'})).rejects.toThrow(
      /resolves outside the project directory/,
    )

    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('throws when file content does not look like SVG', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {icon: 'public/icon.txt', organizationId: 'org-1'},
    } as never)
    mockReadFile.mockResolvedValue('hello world')

    await expect(extractCoreAppManifest({workDir: '/project'})).rejects.toThrow(
      /does not contain an SVG element/,
    )
  })

  test('throws with clear message when icon file cannot be read', async () => {
    mockGetCliConfig.mockResolvedValue({
      app: {icon: 'missing.svg', organizationId: 'org-1'},
    } as never)
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'))

    await expect(extractCoreAppManifest({workDir: '/project'})).rejects.toThrow(
      /Could not read icon file at "missing.svg"/,
    )
  })
})

const manifestWithTitle = (title: string | undefined) => ({title}) as CoreAppManifest

describe('resolveTitleUpdate', () => {
  test('no update when the manifest has no title', () => {
    expect(resolveTitleUpdate(manifestWithTitle(undefined), {title: 'Current'})).toBeNull()
  })

  test('no update when the manifest is missing entirely', () => {
    expect(resolveTitleUpdate(undefined, {title: 'Current'})).toBeNull()
  })

  test('no update when the titles already match', () => {
    expect(resolveTitleUpdate(manifestWithTitle('Same'), {title: 'Same'})).toBeNull()
  })

  test('renames when the manifest title differs', () => {
    expect(resolveTitleUpdate(manifestWithTitle('New'), {title: 'Old'})).toEqual({
      from: 'Old',
      to: 'New',
    })
  })

  test('sets the title when the application has none', () => {
    expect(resolveTitleUpdate(manifestWithTitle('New'), {title: null})).toEqual({
      from: null,
      to: 'New',
    })
  })
})
