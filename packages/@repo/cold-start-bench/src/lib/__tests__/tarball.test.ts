import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {create, extract} from 'tar'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {hashFiles, repackTarball} from '../tarball.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cold-start-tarball-'))
})

afterEach(async () => {
  await rm(dir, {force: true, recursive: true})
})

async function makeTarball(): Promise<string> {
  await mkdir(join(dir, 'src', 'package', 'bin'), {recursive: true})
  await writeFile(
    join(dir, 'src', 'package', 'package.json'),
    JSON.stringify({dependencies: {dep: '^1'}, name: 'pkg', version: '1.0.0'}),
  )
  await writeFile(join(dir, 'src', 'package', 'bin', 'run.js'), 'console.log(1)')
  const file = join(dir, 'in.tgz')
  await create({cwd: join(dir, 'src'), file, gzip: true}, ['package'])
  return file
}

describe('repackTarball', () => {
  test('rewrites the manifest and keeps other files', async () => {
    const input = await makeTarball()
    const output = join(dir, 'out.tgz')

    const manifest = await repackTarball(input, output, (m) => ({...m, version: '1.0.0-bench.x'}))
    expect(manifest.version).toBe('1.0.0-bench.x')

    const out = join(dir, 'out')
    await mkdir(out)
    await extract({cwd: out, file: output})
    expect(JSON.parse(await readFile(join(out, 'package', 'package.json'), 'utf8'))).toEqual({
      dependencies: {dep: '^1'},
      name: 'pkg',
      version: '1.0.0-bench.x',
    })
    expect(await readFile(join(out, 'package', 'bin', 'run.js'), 'utf8')).toBe('console.log(1)')
  })

  test("updates the version in oclif's manifest", async () => {
    await mkdir(join(dir, 'oclif', 'package'), {recursive: true})
    await writeFile(join(dir, 'oclif', 'package', 'package.json'), '{"name":"cli","version":"8.13.0"}')
    await writeFile(
      join(dir, 'oclif', 'package', 'oclif.manifest.json'),
      '{"commands":{"init":{}},"version":"8.13.0"}',
    )
    const input = join(dir, 'oclif.tgz')
    await create({cwd: join(dir, 'oclif'), file: input, gzip: true}, ['package'])

    const output = join(dir, 'oclif-out.tgz')
    await repackTarball(input, output, (m) => ({...m, version: '8.13.1000000001'}))
    const out = join(dir, 'oclif-out')
    await mkdir(out)
    await extract({cwd: out, file: output})
    expect(JSON.parse(await readFile(join(out, 'package', 'oclif.manifest.json'), 'utf8'))).toEqual({
      commands: {init: {}},
      version: '8.13.1000000001',
    })
  })

  test('fails on a tarball without a manifest', async () => {
    await mkdir(join(dir, 'empty', 'package'), {recursive: true})
    await writeFile(join(dir, 'empty', 'package', 'x'), '')
    const input = join(dir, 'empty.tgz')
    await create({cwd: join(dir, 'empty'), file: input, gzip: true}, ['package'])
    await expect(repackTarball(input, join(dir, 'o.tgz'), (m) => m)).rejects.toThrow('ENOENT')
  })
})

describe('hashFiles', () => {
  test('is stable, ignores order and changes with content', async () => {
    await writeFile(join(dir, 'a'), 'a')
    await writeFile(join(dir, 'b'), 'b')
    const first = await hashFiles([join(dir, 'a'), join(dir, 'b')])
    expect(first).toMatch(/^[\da-f]{10}$/)
    expect(await hashFiles([join(dir, 'b'), join(dir, 'a')])).toBe(first)
    await writeFile(join(dir, 'b'), 'changed')
    expect(await hashFiles([join(dir, 'a'), join(dir, 'b')])).not.toBe(first)
  })
})
