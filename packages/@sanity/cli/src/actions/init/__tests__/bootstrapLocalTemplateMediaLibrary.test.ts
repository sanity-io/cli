/**
 * The media-library-config branches of `bootstrapLocalTemplate`: the
 * `.txt` → `.mjs` eslint rename, the empty dependency base (neither studio
 * nor SDK-app dependencies leak in), the skipped `sanity.config.*` write, and
 * the skipped default studio eslint config.
 */
import {afterEach, describe, expect, test, vi} from 'vitest'

import {bootstrapLocalTemplate} from '../bootstrapLocalTemplate.js'

const mockCopy = vi.hoisted(() => vi.fn())
const mockFsRename = vi.hoisted(() => vi.fn())
const mockFsCopyFile = vi.hoisted(() => vi.fn())
const mockFsReadFile = vi.hoisted(() => vi.fn())
const mockFsWriteFile = vi.hoisted(() => vi.fn())
const mockResolveLatestVersions = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('node:fs/promises', () => ({
  default: {
    copyFile: mockFsCopyFile,
    readFile: mockFsReadFile,
    rename: mockFsRename,
    writeFile: mockFsWriteFile,
  },
}))
vi.mock('../../../util/copy.js', () => ({copy: mockCopy}))
vi.mock('../../../util/resolveLatestVersions.js', () => ({
  resolveLatestVersions: mockResolveLatestVersions,
}))

async function bootstrap() {
  mockCopy.mockResolvedValue(undefined)
  mockFsRename.mockResolvedValue(undefined)
  mockFsCopyFile.mockResolvedValue(undefined)
  mockFsWriteFile.mockResolvedValue(undefined)
  // Echo every requested dependency back at a fixed version, so the
  // package.json assertion sees exactly what was requested.
  mockResolveLatestVersions.mockImplementation((packages: Record<string, string>) =>
    Promise.resolve(Object.fromEntries(Object.keys(packages).map((name) => [name, '9.9.9']))),
  )

  return bootstrapLocalTemplate({
    output: {log: vi.fn(), warn: vi.fn()} as never,
    outputPath: '/test/out/My Config!',
    packageName: 'ignored-for-media-templates',
    templateName: 'media-library-config',
    useTypeScript: true,
    // Only organizationId matters for media templates; the rest of the shape
    // is studio bookkeeping the media branch never reads.
    variables: {
      autoUpdates: false,
      dataset: 'unused',
      organizationId: 'org-1',
      projectId: 'unused',
      workbench: false,
    },
  })
}

function writtenFile(name: string): string | undefined {
  const call = mockFsWriteFile.mock.calls.find(([filePath]) => String(filePath).endsWith(name))
  return call?.[1] as string | undefined
}

describe('bootstrapLocalTemplate (media-library-config)', () => {
  afterEach(() => vi.clearAllMocks())

  test('renames the shipped eslint.config.txt to eslint.config.mjs after copying', async () => {
    await bootstrap()

    expect(mockFsRename).toHaveBeenCalledWith(
      expect.stringContaining('eslint.config.txt'),
      expect.stringContaining('eslint.config.mjs'),
    )
  })

  test('package.json carries only the template dependencies, named from the output dir', async () => {
    await bootstrap()

    const manifest = JSON.parse(writtenFile('package.json') ?? '{}')
    // Slugified output-path basename, not the passed packageName.
    expect(manifest.name).toBe('my-config')
    // The template's own sets, resolved — with no studio or SDK-app base
    // leaking in (`sanity` would also appear in a studio base, so assert a
    // marker from each base instead).
    expect(Object.keys(manifest.dependencies)).toEqual(
      expect.arrayContaining(['sanity', 'react', 'react-dom', '@sanity/ui', 'styled-components']),
    )
    expect(manifest.dependencies['@sanity/vision']).toBeUndefined()
    expect(manifest.dependencies['@sanity/sdk-react']).toBeUndefined()
    expect(manifest.devDependencies['typescript-eslint']).toBe('9.9.9')
  })

  test('writes sanity.cli.ts with the media-library config, and no sanity.config.ts', async () => {
    await bootstrap()

    const cliConfig = writtenFile('sanity.cli.ts')
    expect(cliConfig).toContain('unstable_defineMediaLibrary')
    expect(cliConfig).toContain(`organizationId: 'org-1'`)
    expect(writtenFile('sanity.config.ts')).toBeUndefined()
  })

  test('does not overwrite the shipped eslint config with the default studio one', async () => {
    await bootstrap()

    expect(writtenFile('eslint.config.mjs')).toBeUndefined()
  })
})
