import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {applyTransforms} from '../applyTransforms.js'

describe('applyTransforms', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, {force: true, recursive: true})))
    tempDirs.length = 0
  })

  test('updates sanity.config and schema export deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-transforms-'))
    tempDirs.push(root)

    await mkdir(join(root, 'schemaTypes'), {recursive: true})
    await writeFile(
      join(root, 'sanity.config.ts'),
      'export default defineConfig({plugins: [structureTool()]})\n',
      'utf8',
    )
    await writeFile(join(root, 'schemaTypes/index.ts'), 'export const schemaTypes = []\n', 'utf8')
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({dependencies: {}, name: 'studio', version: '1.0.0'}, null, 2),
      'utf8',
    )

    const result = await applyTransforms({
      dryRun: false,
      manifest: {
        dependencies: {dependencies: {'@sanity/vision': '^3.0.0'}},
        files: [],
        name: 'studio-core',
        transforms: [
          {
            importName: 'visionTool',
            importPath: '@sanity/vision',
            pluginCall: 'visionTool()',
            type: 'sanityConfigPlugin',
          },
          {
            importName: 'authorType',
            importPath: './authorType',
            type: 'schemaTypeExport',
          },
        ],
        version: '1.0.0',
      },
      projectRoot: root,
      studioLayout: {
        schemaDirectory: 'schemaTypes',
        schemaIndexPath: join(root, 'schemaTypes/index.ts'),
        studioConfigPath: join(root, 'sanity.config.ts'),
      },
    })

    expect(result.updatedFiles).toContain('sanity.config.ts')
    expect(result.updatedFiles).toContain('schemaTypes/index.ts')
    expect(result.updatedFiles).toContain('package.json')

    const sanityConfig = await readFile(join(root, 'sanity.config.ts'), 'utf8')
    expect(sanityConfig).toContain("from '@sanity/vision'")
    expect(sanityConfig).toContain('visionTool()')

    const schemaIndex = await readFile(join(root, 'schemaTypes/index.ts'), 'utf8')
    expect(schemaIndex).toContain("import {authorType} from './authorType'")
    expect(schemaIndex).toContain('authorType')
  })

  test('returns manual step for ambiguous sanity.config edits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-transforms-'))
    tempDirs.push(root)

    await mkdir(join(root, 'schemaTypes'), {recursive: true})
    await writeFile(join(root, 'sanity.config.ts'), 'export default defineConfig({})\n', 'utf8')
    await writeFile(join(root, 'schemaTypes/index.ts'), 'export const schemaTypes = []\n', 'utf8')

    const result = await applyTransforms({
      dryRun: false,
      manifest: {
        files: [],
        name: 'studio-core',
        transforms: [
          {
            importName: 'visionTool',
            importPath: '@sanity/vision',
            pluginCall: 'visionTool()',
            type: 'sanityConfigPlugin',
          },
        ],
        version: '1.0.0',
      },
      projectRoot: root,
      studioLayout: {
        schemaDirectory: 'schemaTypes',
        schemaIndexPath: join(root, 'schemaTypes/index.ts'),
        studioConfigPath: join(root, 'sanity.config.ts'),
      },
    })

    expect(result.manualSteps[0]).toContain('Could not update "sanity.config.ts" automatically')
    expect(result.skippedFiles[0]).toEqual({
      file: 'sanity.config.ts',
      reason: 'plugins array not found',
    })
  })
})
