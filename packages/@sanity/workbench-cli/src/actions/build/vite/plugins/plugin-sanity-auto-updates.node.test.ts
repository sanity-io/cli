import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type Plugin, type ResolvedConfig} from 'vite'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {sanityAutoUpdates} from './plugin-sanity-auto-updates.js'

const SDK_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t1/%5E2.0.0/@sanity__sdk'
const SDK_REACT_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t1/%5E2.0.0/@sanity__sdk-react'

const packages = [
  {name: '@sanity/sdk', url: SDK_URL},
  {name: '@sanity/sdk-react', url: SDK_REACT_URL},
]

function createPlugin(): Plugin {
  return sanityAutoUpdates(packages)[1]
}

function evaluateAutoUpdatesModule(plugins: Plugin[], moduleUrl: (name: string) => unknown) {
  const code = (plugins[0].load as (id: string) => string)('\0virtual:sanity/auto-updates')
  const body = code
    .replace(
      /^import \{createAutoUpdatesLoader\} from .*$/m,
      'const {createAutoUpdatesLoader} = deps',
    )
    .replace(/^import \* as React from 'react'$/m, 'const React = {}')
    .replaceAll(/^export /gm, '')
  const createAutoUpdatesLoader = () => ({load: () => {}, moduleUrl})

  return new Function('deps', `${body}\nreturn {studioProps}`)({createAutoUpdatesLoader}) as {
    studioProps: () => object
  }
}

describe('resolveId', () => {
  it.each([
    {
      expected: '\0sanity/auto-updates:@sanity/sdk',
      importer: '/app/src/App.tsx',
      source: '@sanity/sdk',
    },
    {
      expected: '\0sanity/auto-updates:@sanity/sdk/dashboard',
      importer: '/app/src/App.tsx',
      source: '@sanity/sdk/dashboard',
    },
    {expected: null, importer: '/app/src/App.tsx', source: '@sanity/sdk-other'},
    {
      expected: null,
      importer: '/app/node_modules/.pnpm/x/node_modules/@sanity/sdk-react/dist/index.js',
      source: '@sanity/sdk',
    },
    {expected: null, importer: '\0sanity/auto-updates:@sanity/sdk', source: '@sanity/sdk'},
    {expected: null, importer: undefined, source: '@sanity/sdk'},
  ])('resolves $source from $importer to $expected', ({expected, importer, source}) => {
    const resolveId = createPlugin().resolveId as (source: string, importer?: string) => unknown

    expect(resolveId(source, importer)).toBe(expected)
  })
})

it('gives the studio its app ID and import map URL once sanity came from the module CDN', () => {
  vi.stubGlobal('__SANITY_APP_ID__', 'app1')
  const loadedFrom = new Map<string, string>()
  const moduleUrl = (name: string) => loadedFrom.get(name)
  const {studioProps} = evaluateAutoUpdatesModule(sanityAutoUpdates(packages), moduleUrl)

  expect(studioProps()).toEqual({})
  const sanityUrl = 'https://sanity-cdn.com/v1/modules/by-app/app1/t1/%5E6.0.0/sanity'
  loadedFrom.set('sanity', sanityUrl)
  expect(studioProps()).toEqual({unstable_appId: 'app1', unstable_importMapUrl: sanityUrl})

  const withoutPackages = sanityAutoUpdates()
  expect(withoutPackages).toHaveLength(1)
  expect(evaluateAutoUpdatesModule(withoutPackages, moduleUrl).studioProps()).toEqual({})
  vi.unstubAllGlobals()
})

describe('wrapper exports', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'auto-updates-'))
  })

  afterEach(async () => {
    await rm(dir, {force: true, recursive: true})
  })

  it('re-exports every export of the installed package, following export *', async () => {
    await writeFile(
      path.join(dir, 'index.js'),
      `export * from './types.js'
export * as ns from './ns.js'
export default 1
const local = 1
export {local as 'kebab-name'}
export function fn() {}
export const one = 1, two = 2
`,
    )
    await writeFile(
      path.join(dir, 'types.js'),
      `export const defineType = 1
export default 2
export * from './index.js'
`,
    )
    await writeFile(path.join(dir, 'ns.js'), 'export const inner = 1\n')

    const plugin = createPlugin()
    ;(plugin.configResolved as (config: ResolvedConfig) => void)({root: dir} as ResolvedConfig)
    const context = {
      resolve: async (source: string, importer: string) => ({
        id:
          source === '@sanity/sdk'
            ? path.join(dir, 'index.js')
            : path.resolve(path.dirname(importer), source),
      }),
    }
    const load = plugin.load as (this: typeof context, id: string) => Promise<string>
    const code = await load.call(context, '\0sanity/auto-updates:@sanity/sdk')

    const exported = [...code.matchAll(/ as ("[^"]+")/g)].map(([, name]) => JSON.parse(name))
    expect(exported.toSorted()).toEqual([
      'default',
      'defineType',
      'fn',
      'kebab-name',
      'ns',
      'one',
      'two',
    ])
    expect(code).toContain(`await load("@sanity/sdk", () => import("@sanity/sdk"))`)
  })
})
