import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {tryFindStudioConfigPath} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {detectStudioLayout} from '../detectStudioLayout.js'

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    tryFindStudioConfigPath: vi.fn(),
  }
})

const mockedTryFindStudioConfigPath = vi.mocked(tryFindStudioConfigPath)

describe('detectStudioLayout', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    vi.clearAllMocks()
    await Promise.all(tempDirs.map((dir) => rm(dir, {force: true, recursive: true})))
    tempDirs.length = 0
  })

  test('uses detected schemaTypes directory and existing index', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-layout-'))
    tempDirs.push(root)

    mockedTryFindStudioConfigPath.mockResolvedValueOnce(join(root, 'sanity.config.ts'))
    await mkdir(join(root, 'schemaTypes'), {recursive: true})
    await writeFile(join(root, 'schemaTypes/index.ts'), 'export const schemaTypes = []\n', 'utf8')

    const layout = await detectStudioLayout(root)
    expect(layout.schemaDirectory).toBe('schemaTypes')
    expect(layout.schemaIndexPath).toBe(join(root, 'schemaTypes/index.ts'))
  })

  test('falls back to schema when configured in local registry config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-layout-'))
    tempDirs.push(root)

    mockedTryFindStudioConfigPath.mockResolvedValueOnce(join(root, 'sanity.config.ts'))
    await mkdir(join(root, '.sanity'), {recursive: true})
    await mkdir(join(root, 'schema'), {recursive: true})
    await writeFile(
      join(root, '.sanity/registry.config.json'),
      JSON.stringify({
        schemaDirCandidates: ['schema', 'schemaTypes'],
      }),
      'utf8',
    )

    const layout = await detectStudioLayout(root)
    expect(layout.schemaDirectory).toBe('schema')
    expect(layout.schemaIndexPath).toBe(join(root, 'schema/index.ts'))
  })

  test('throws when studio config cannot be found', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-layout-'))
    tempDirs.push(root)

    mockedTryFindStudioConfigPath.mockResolvedValueOnce(undefined)

    await expect(detectStudioLayout(root)).rejects.toThrow('Unable to find Sanity Studio config')
  })
})
