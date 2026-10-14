import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {skipDependencySourcemapsPlugin} from '../skipDependencySourcemapsPlugin.js'

type LoadResult = {code: string; map: {mappings: string}} | null

function load(id: string): Promise<LoadResult> {
  const plugin = skipDependencySourcemapsPlugin()
  const hook = plugin.load as (this: unknown, id: string) => Promise<LoadResult>
  return hook.call({}, id)
}

describe('skipDependencySourcemapsPlugin', () => {
  let rootDir: string
  let depDir: string

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'skip-dep-sourcemaps-'))
    depDir = join(rootDir, 'node_modules', 'some-dep', 'lib')
    await mkdir(depDir, {recursive: true})
  })

  afterEach(async () => {
    await rm(rootDir, {force: true, recursive: true})
  })

  test('runs after other plugins so they can still claim dependency files', () => {
    const plugin = skipDependencySourcemapsPlugin()
    expect(plugin.enforce).toBe('post')
    expect(plugin.name).toBe('sanity:studio-worker-skip-dependency-sourcemaps')
  })

  test('loads dependency scripts with an empty source map and no map comments', async () => {
    const file = join(depDir, 'index.js')
    await writeFile(
      file,
      [
        'export const a = 1',
        '//# sourceMappingURL=index.js.map',
        '//@ sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ==',
      ].join('\n'),
    )

    const result = await load(file)

    expect(result?.map).toEqual({mappings: ''})
    expect(result?.code).toContain('export const a = 1')
    expect(result?.code).not.toContain('sourceMappingURL')
    expect(result?.code).toContain(`//# sourceURL=${file}`)
  })

  test('keeps sourceMappingURL text that is not a source map comment', async () => {
    const file = join(depDir, 'generator.mjs')
    const source = [
      'const a = "//# sourceMappingURL=" + name',
      'const b = `',
      '//# sourceMappingURL=${name}`',
    ].join('\n')
    await writeFile(file, source)

    const result = await load(file)

    expect(result?.code.startsWith(source)).toBe(true)
  })

  test('handles .cjs files', async () => {
    const file = join(depDir, 'index.cjs')
    await writeFile(file, 'module.exports = 1\n//# sourceMappingURL=index.cjs.map\n')

    const result = await load(file)

    expect(result?.map).toEqual({mappings: ''})
    expect(result?.code).not.toContain('sourceMappingURL')
  })

  test('encodes whitespace in the sourceURL', async () => {
    const spacedDir = join(rootDir, 'node_modules', 'spaced dep')
    await mkdir(spacedDir, {recursive: true})
    const file = join(spacedDir, 'index.js')
    await writeFile(file, 'export {}\n')

    const result = await load(file)

    expect(result?.code).toContain(`//# sourceURL=${file.replaceAll(' ', '%20')}`)
  })

  test.each([
    ['user code outside node_modules', (dir: string) => join(dir, 'sanity.config.js')],
    ['TypeScript in node_modules', (dir: string) => join(dir, 'node_modules', 'dep', 'index.ts')],
    ['ids with a query', (dir: string) => `${join(dir, 'node_modules', 'dep', 'index.js')}?raw`],
    ['virtual modules', () => '\0virtual:node_modules/dep/index.js'],
  ])('leaves %s to Vite', async (_label, getId) => {
    await expect(load(getId(rootDir))).resolves.toBeNull()
  })

  test('leaves missing files to Vite', async () => {
    await expect(load(join(depDir, 'missing.js'))).resolves.toBeNull()
  })
})
