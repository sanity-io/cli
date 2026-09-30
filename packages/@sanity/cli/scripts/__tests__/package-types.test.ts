import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect, test} from 'vitest'

import {prepareTypeDependencies} from '../package-types.js'

test('includes nested declaration dependencies without copying runtime implementations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cli-package-types-'))
  try {
    const stage = join(root, 'deploy')
    const output = join(root, 'package')
    const tool = join(stage, 'node_modules/tool')
    const dependency = join(tool, 'node_modules/@scope/types')
    const nested = join(dependency, 'dist.v1')
    await mkdir(nested, {recursive: true})
    await writeFile(join(tool, 'package.json'), '{"name":"tool","types":"./index.d.ts"}')
    await writeFile(join(tool, 'index.d.ts'), 'export {Value} from "@scope/types";')
    await writeFile(join(dependency, 'package.json'), '{"types":"./dist.v1/index.d.ts"}')
    await writeFile(join(nested, 'index.d.ts'), 'export interface Value {answer: 42}')
    await writeFile(join(nested, 'index.js'), 'throw new Error("Do not ship this runtime")')
    await writeFile(join(dependency, 'LICENSE'), 'License text')
    // Existing adapters must survive the declaration copy.
    const existing = join(output, 'dist/node_modules/tool')
    await mkdir(existing, {recursive: true})
    await writeFile(join(existing, 'package.json'), '{"exports":"./adapter.mjs"}')
    await prepareTypeDependencies(stage, output, [tool])
    const copied = join(existing, 'node_modules/@scope/types')
    expect(await readFile(join(copied, 'dist.v1/index.d.ts'), 'utf8')).toContain('answer: 42')
    expect(await readFile(join(copied, 'LICENSE'), 'utf8')).toBe('License text')
    expect(await readFile(join(existing, 'package.json'), 'utf8')).toContain('adapter.mjs')
    await expect(readFile(join(copied, 'dist.v1/index.js'))).rejects.toMatchObject({code: 'ENOENT'})
  } finally {
    await rm(root, {force: true, recursive: true})
  }
})
