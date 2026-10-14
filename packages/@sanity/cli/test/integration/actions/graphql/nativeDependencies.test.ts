import {cp, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {studioWorkerTask} from '@sanity/cli-core/tasks'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

const fixtures = new URL('../../../__fixtures__/native-dependencies/', import.meta.url)
let root: string

async function copyFixture(name: string) {
  await cp(new URL(name, fixtures), root, {recursive: true})
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'studio native dependencies ')))
  await copyFixture('base')
})

afterEach(async () => {
  await rm(root, {force: true, recursive: true})
})

function run(nativeDependencies = true) {
  return studioWorkerTask(pathToFileURL(join(root, 'probe.worker.ts')), {
    name: 'native-dependencies-test',
    nativeDependencies,
    studioRootPath: root,
    timeout: 30_000,
  })
}

describe('GraphQL worker dependency loading', {timeout: 60_000}, () => {
  test('shares dependency identity and preserves CommonJS defaults and named exports', async () => {
    await copyFixture('shared-identity')
    const expected = {css: 'css', div: 'styled.div', same: true}
    expect(await run(false)).toEqual(expected)
    expect(await run()).toEqual(expected)
  })

  test('keeps a plugin’s own dependency version', async () => {
    await copyFixture('nested-dependency')
    expect(await run()).toEqual({nested: 'nested', value: 'original'})
  })

  test.each(['object', 'function'])(
    'preserves dependency transforms from a custom Vite %s config',
    async (kind) => {
      await copyFixture('custom-vite')
      await copyFixture(`custom-vite-${kind}`)
      expect(await run()).toBe('transformed')
    },
  )

  test.each(['paths', 'baseUrl'])(
    'preserves dependency overrides using TypeScript %s',
    async (kind) => {
      await copyFixture('typescript-overrides')
      const compilerOptions =
        kind === 'paths' ? {paths: {dep: ['./local-dep.ts']}} : {baseUrl: './local'}
      await writeFile(join(root, 'tsconfig.json'), JSON.stringify({compilerOptions}))
      expect(await run()).toBe('aliased')
    },
  )

  test('preserves local TypeScript aliases, CSS, environment values and file metadata', async () => {
    await copyFixture('local-files')
    await writeFile(join(root, '.env'), 'SANITY_STUDIO_NATIVE_TEST=loaded')
    expect(await run()).toEqual({
      env: 'loaded',
      url: pathToFileURL(join(root, 'src/value.ts')).href,
      value: 'aliased',
    })
  })

  test('loads a file URL resolved by the worker when config does not import Sanity', async () => {
    await writeFile(
      join(root, 'probe.worker.ts'),
      `import {parentPort} from 'node:worker_threads'; const mod = await import(${JSON.stringify(pathToFileURL(join(root, 'node_modules/sanity/index.js')).href)}); parentPort.postMessage(typeof mod.identity)`,
    )
    expect(await run()).toBe('object')
  })
})
