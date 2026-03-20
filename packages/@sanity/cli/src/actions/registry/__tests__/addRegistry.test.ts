import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, test} from 'vitest'

import {addRegistry} from '../addRegistry.js'

describe('addRegistry', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, {force: true, recursive: true})))
    tempDirs.length = 0
  })

  test('installs schema and referenced component with local source', async () => {
    const registryRoot = await mkdtemp(join(tmpdir(), 'registry-local-'))
    const studioRoot = await mkdtemp(join(tmpdir(), 'studio-local-'))
    tempDirs.push(registryRoot, studioRoot)

    await mkdir(join(registryRoot, 'schema-types'), {recursive: true})
    await mkdir(join(registryRoot, 'components'), {recursive: true})
    await writeFile(
      join(registryRoot, 'schema-types/authorType.ts'),
      "import {SeoBadge} from '../components/SeoBadge'\nexport const authorType = {name: 'author', components: {input: SeoBadge}}\n",
      'utf8',
    )
    await writeFile(
      join(registryRoot, 'components/SeoBadge.tsx'),
      'export function SeoBadge() { return null }\n',
      'utf8',
    )
    await writeFile(
      join(registryRoot, 'sanity-registry.json'),
      JSON.stringify({
        files: [
          {source: 'schema-types/authorType.ts', target: '{schemaDir}/authorType.ts'},
          {source: 'components/SeoBadge.tsx', target: 'src/components/SeoBadge.tsx'},
        ],
        name: 'local-test',
        transforms: [
          {importName: 'authorType', importPath: './authorType', type: 'schemaTypeExport'},
        ],
        version: '1.0.0',
      }),
      'utf8',
    )

    await mkdir(join(studioRoot, 'schemaTypes'), {recursive: true})
    await writeFile(
      join(studioRoot, 'schemaTypes/index.ts'),
      'export const schemaTypes = []\n',
      'utf8',
    )
    await writeFile(
      join(studioRoot, 'sanity.config.ts'),
      'export default defineConfig({plugins: [structureTool()], schema: {types: schemaTypes}})\n',
      'utf8',
    )

    await addRegistry({
      dryRun: false,
      local: true,
      output: {log: () => undefined} as never,
      overwrite: false,
      projectRoot: studioRoot,
      source: registryRoot,
      unattended: true,
    })

    const installedSchema = await readFile(join(studioRoot, 'schemaTypes/authorType.ts'), 'utf8')
    const installedComponent = await readFile(join(studioRoot, 'components/SeoBadge.tsx'), 'utf8')

    expect(installedSchema).toContain("from '../components/SeoBadge'")
    expect(installedComponent).toContain('SeoBadge')
  })

  test('auto-builds manifest when sanity-registry.json is missing', async () => {
    const registryRoot = await mkdtemp(join(tmpdir(), 'registry-local-'))
    const studioRoot = await mkdtemp(join(tmpdir(), 'studio-local-'))
    tempDirs.push(registryRoot, studioRoot)

    await mkdir(join(registryRoot, 'src/schema-types'), {recursive: true})
    await writeFile(
      join(registryRoot, 'src/schema-types/authorType.ts'),
      "export const authorType = {name: 'author'}\n",
      'utf8',
    )
    await writeFile(
      join(registryRoot, 'registry.source.json'),
      JSON.stringify({
        name: 'local-autobuild',
        transforms: [
          {importName: 'authorType', importPath: './authorType', type: 'schemaTypeExport'},
        ],
        version: '1.0.0',
      }),
      'utf8',
    )

    await mkdir(join(studioRoot, 'schemaTypes'), {recursive: true})
    await writeFile(
      join(studioRoot, 'schemaTypes/index.ts'),
      'export const schemaTypes = []\n',
      'utf8',
    )
    await writeFile(
      join(studioRoot, 'sanity.config.ts'),
      'export default defineConfig({plugins: [structureTool()], schema: {types: schemaTypes}})\n',
      'utf8',
    )

    await addRegistry({
      dryRun: false,
      local: true,
      output: {log: () => undefined} as never,
      overwrite: false,
      projectRoot: studioRoot,
      source: registryRoot,
      unattended: true,
    })

    const installedSchema = await readFile(join(studioRoot, 'schemaTypes/authorType.ts'), 'utf8')
    const schemaIndex = await readFile(join(studioRoot, 'schemaTypes/index.ts'), 'utf8')

    expect(installedSchema).toContain("name: 'author'")
    expect(schemaIndex).toContain('authorType')
  })
})
