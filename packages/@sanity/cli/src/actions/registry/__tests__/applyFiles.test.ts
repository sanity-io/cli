import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {applyFiles} from '../applyFiles.js'

describe('applyFiles', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, {force: true, recursive: true})))
    tempDirs.length = 0
  })

  test('adds new files and supports dry run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-files-'))
    const registry = await mkdtemp(join(tmpdir(), 'registry-source-'))
    tempDirs.push(root, registry)

    await mkdir(join(registry, 'files'), {recursive: true})
    await writeFile(join(registry, 'files/author.ts'), 'export const author = {}\n', 'utf8')

    const dryRunResult = await applyFiles({
      dryRun: true,
      manifest: {
        files: [{source: 'files/author.ts', target: '{schemaDir}/author.ts'}],
        name: 'studio-core',
        version: '1.0.0',
      },
      overwrite: false,
      projectRoot: root,
      registryDirectory: registry,
      studioLayout: {
        schemaDirectory: 'schemaTypes',
        schemaIndexPath: join(root, 'schemaTypes/index.ts'),
        studioConfigPath: join(root, 'sanity.config.ts'),
      },
    })

    expect(dryRunResult.addedFiles).toEqual(['schemaTypes/author.ts'])

    const writeResult = await applyFiles({
      dryRun: false,
      manifest: {
        files: [{source: 'files/author.ts', target: '{schemaDir}/author.ts'}],
        name: 'studio-core',
        version: '1.0.0',
      },
      overwrite: false,
      projectRoot: root,
      registryDirectory: registry,
      studioLayout: {
        schemaDirectory: 'schemaTypes',
        schemaIndexPath: join(root, 'schemaTypes/index.ts'),
        studioConfigPath: join(root, 'sanity.config.ts'),
      },
    })

    expect(writeResult.addedFiles).toEqual(['schemaTypes/author.ts'])
    const fileContent = await readFile(join(root, 'schemaTypes/author.ts'), 'utf8')
    expect(fileContent).toContain('author')
  })

  test('skips existing files without overwrite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-files-'))
    const registry = await mkdtemp(join(tmpdir(), 'registry-source-'))
    tempDirs.push(root, registry)

    await mkdir(join(root, 'schemaTypes'), {recursive: true})
    await writeFile(join(root, 'schemaTypes/author.ts'), 'existing\n', 'utf8')
    await mkdir(join(registry, 'files'), {recursive: true})
    await writeFile(join(registry, 'files/author.ts'), 'new\n', 'utf8')

    const result = await applyFiles({
      dryRun: false,
      manifest: {
        files: [{source: 'files/author.ts', target: '{schemaDir}/author.ts'}],
        name: 'studio-core',
        version: '1.0.0',
      },
      overwrite: false,
      projectRoot: root,
      registryDirectory: registry,
      studioLayout: {
        schemaDirectory: 'schemaTypes',
        schemaIndexPath: join(root, 'schemaTypes/index.ts'),
        studioConfigPath: join(root, 'sanity.config.ts'),
      },
    })

    expect(result.skippedFiles).toEqual([{file: 'schemaTypes/author.ts', reason: 'already exists'}])
    const fileContent = await readFile(join(root, 'schemaTypes/author.ts'), 'utf8')
    expect(fileContent).toBe('existing\n')
  })

  test('strips src prefix when project has no src directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-files-'))
    const registry = await mkdtemp(join(tmpdir(), 'registry-source-'))
    tempDirs.push(root, registry)

    await mkdir(join(registry, 'src/components'), {recursive: true})
    await writeFile(
      join(registry, 'src/components/SeoBadge.tsx'),
      'export const SeoBadge = () => null\n',
      'utf8',
    )

    const result = await applyFiles({
      dryRun: true,
      manifest: {
        files: [{source: 'src/components/SeoBadge.tsx', target: 'src/components/SeoBadge.tsx'}],
        name: 'studio-core',
        version: '1.0.0',
      },
      overwrite: false,
      projectRoot: root,
      registryDirectory: registry,
      studioLayout: {
        schemaDirectory: 'schemaTypes',
        schemaIndexPath: join(root, 'schemaTypes/index.ts'),
        studioConfigPath: join(root, 'sanity.config.ts'),
      },
    })

    expect(result.addedFiles).toEqual(['components/SeoBadge.tsx'])
  })

  test('keeps src prefix when project already has src directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'registry-files-'))
    const registry = await mkdtemp(join(tmpdir(), 'registry-source-'))
    tempDirs.push(root, registry)

    await mkdir(join(root, 'src'), {recursive: true})
    await mkdir(join(registry, 'src/components'), {recursive: true})
    await writeFile(
      join(registry, 'src/components/SeoBadge.tsx'),
      'export const SeoBadge = () => null\n',
      'utf8',
    )

    const result = await applyFiles({
      dryRun: true,
      manifest: {
        files: [{source: 'src/components/SeoBadge.tsx', target: 'src/components/SeoBadge.tsx'}],
        name: 'studio-core',
        version: '1.0.0',
      },
      overwrite: false,
      projectRoot: root,
      registryDirectory: registry,
      studioLayout: {
        schemaDirectory: 'schemaTypes',
        schemaIndexPath: join(root, 'schemaTypes/index.ts'),
        studioConfigPath: join(root, 'sanity.config.ts'),
      },
    })

    expect(result.addedFiles).toEqual(['src/components/SeoBadge.tsx'])
  })
})
