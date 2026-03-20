import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {loadRegistryManifest} from '../loadRegistryManifest.js'

describe('loadRegistryManifest', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, {force: true, recursive: true})))
    tempDirs.length = 0
  })

  test('loads valid manifest data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'registry-manifest-'))
    tempDirs.push(dir)

    await writeFile(
      join(dir, 'sanity-registry.json'),
      JSON.stringify({
        files: [{source: 'files/author.ts', target: '{schemaDir}/author.ts'}],
        name: 'studio-core',
        transforms: [
          {
            importName: 'author',
            importPath: './author',
            type: 'schemaTypeExport',
          },
        ],
        version: '1.0.0',
      }),
      'utf8',
    )

    const manifest = await loadRegistryManifest(dir)
    expect(manifest.name).toBe('studio-core')
    expect(manifest.files).toHaveLength(1)
    expect(manifest.transforms?.[0]?.type).toBe('schemaTypeExport')
  })

  test('throws when manifest is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'registry-manifest-'))
    tempDirs.push(dir)

    await expect(loadRegistryManifest(dir)).rejects.toThrow('Could not find sanity-registry.json')
  })

  test('throws actionable validation errors for invalid manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'registry-manifest-'))
    tempDirs.push(dir)

    await writeFile(
      join(dir, 'sanity-registry.json'),
      JSON.stringify({
        files: [{source: '', target: ''}],
        name: '',
        version: '',
      }),
      'utf8',
    )

    await expect(loadRegistryManifest(dir)).rejects.toThrow('sanity-registry.json is invalid')
  })
})
