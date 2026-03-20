import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {buildRegistryManifest} from '../buildRegistryManifest.js'

describe('buildRegistryManifest', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, {force: true, recursive: true})))
    tempDirs.length = 0
  })

  test('builds manifest from conventions and writes sanity-registry.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-build-'))
    tempDirs.push(root)

    await writeFile(
      join(root, 'registry.source.json'),
      JSON.stringify({
        name: 'demo',
        transforms: [
          {
            importName: 'authorType',
            importPath: './authorType',
            type: 'schemaTypeExport',
          },
        ],
        version: '1.0.0',
      }),
      'utf8',
    )
    await mkdir(join(root, 'src/schema-types'), {recursive: true})
    await mkdir(join(root, 'src/components/inputs'), {recursive: true})
    await writeFile(
      join(root, 'src/schema-types/authorType.ts'),
      'export const authorType = {}\n',
      'utf8',
    )
    await writeFile(
      join(root, 'src/components/inputs/TagInput.tsx'),
      'export function TagInput() { return null }\n',
      'utf8',
    )

    const result = await buildRegistryManifest({dryRun: false, registryDirectory: root})

    expect(result.manifest.files).toEqual(
      expect.arrayContaining([
        {
          source: 'src/components/inputs/TagInput.tsx',
          target: 'src/components/inputs/TagInput.tsx',
        },
        {source: 'src/schema-types/authorType.ts', target: '{schemaDir}/authorType.ts'},
      ]),
    )

    const written = JSON.parse(await readFile(join(root, 'sanity-registry.json'), 'utf8')) as {
      files: Array<{source: string; target: string}>
    }
    expect(written.files).toEqual(
      expect.arrayContaining([
        {source: 'src/schema-types/authorType.ts', target: '{schemaDir}/authorType.ts'},
      ]),
    )
  })

  test('supports dry run without writing manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-build-'))
    tempDirs.push(root)

    await writeFile(
      join(root, 'registry.source.json'),
      JSON.stringify({
        name: 'demo',
        version: '1.0.0',
      }),
      'utf8',
    )

    const result = await buildRegistryManifest({dryRun: true, registryDirectory: root})
    expect(result.manifest.name).toBe('demo')
    await expect(readFile(join(root, 'sanity-registry.json'), 'utf8')).rejects.toThrow()
  })

  test('supports registry.source.ts config files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-build-'))
    tempDirs.push(root)

    await writeFile(
      join(root, 'registry.source.ts'),
      `
export default {
  name: 'demo-ts',
  version: '1.0.0',
}
`,
      'utf8',
    )

    const result = await buildRegistryManifest({dryRun: true, registryDirectory: root})
    expect(result.manifest.name).toBe('demo-ts')
  })

  test('throws helpful error when registry source config is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-build-'))
    tempDirs.push(root)

    await expect(buildRegistryManifest({dryRun: true, registryDirectory: root})).rejects.toThrow(
      'Could not find a registry source config',
    )
  })
})
