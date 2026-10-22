import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type Environment, parseAst, type Plugin, type ResolvedConfig} from 'vite'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {FEDERATION_DIR_NAME} from '../constants.js'
import {sanityAutoUpdates} from './plugin-sanity-auto-updates.js'

const SDK_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t1/%5E2.0.0/@sanity__sdk'
const SDK_REACT_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t1/%5E2.0.0/@sanity__sdk-react'

function createPlugin(): Plugin {
  return sanityAutoUpdates({
    imports: {
      '@sanity/sdk': SDK_URL,
      '@sanity/sdk-react': SDK_REACT_URL,
      '@sanity/sdk-react/': `${SDK_REACT_URL}/`,
      '@sanity/sdk/': `${SDK_URL}/`,
    },
  })
}

describe('resolveId', () => {
  it.each([
    {
      expected: '\0sanity/auto-updates:@sanity/sdk',
      importer: '/app/src/App.tsx',
      source: '@sanity/sdk',
    },
    {
      expected: '\0sanity/auto-updates:@sanity/sdk-react',
      importer: '/app/src/App.tsx',
      source: '@sanity/sdk-react',
    },
    {
      expected: '\0sanity/auto-updates:@sanity/sdk/dashboard',
      importer: '/app/src/App.tsx',
      source: '@sanity/sdk/dashboard',
    },
    {expected: undefined, importer: '/app/src/App.tsx', source: '@sanity/sdk-other'},
    {expected: undefined, importer: '/app/src/App.tsx', source: 'react'},
    {
      expected: undefined,
      importer: '/app/node_modules/.pnpm/x/node_modules/@sanity/sdk-react/dist/index.js',
      source: '@sanity/sdk',
    },
    {expected: undefined, importer: '\0sanity/auto-updates:@sanity/sdk', source: '@sanity/sdk'},
    {expected: undefined, importer: undefined, source: '@sanity/sdk'},
  ])('resolves $source from $importer to $expected', ({expected, importer, source}) => {
    const resolveId = createPlugin().resolveId as (source: string, importer?: string) => unknown

    expect(resolveId(source, importer)).toBe(expected)
  })
})

it('creates the loader with the app ID', async () => {
  const plugin = sanityAutoUpdates({appId: 'app1', imports: {'@sanity/sdk': SDK_URL}})
  const load = plugin.load as (id: string) => Promise<string>

  expect(await load('\0virtual:sanity/auto-updates-loader')).toContain('appId: "app1"')
})

describe('applyToEnvironment', () => {
  it.each([
    {applies: true, command: 'build', name: FEDERATION_DIR_NAME},
    {applies: false, command: 'build', name: 'client'},
    {applies: false, command: 'serve', name: FEDERATION_DIR_NAME},
  ])('$command in $name: $applies', ({applies, command, name}) => {
    const apply = createPlugin().applyToEnvironment as (environment: Environment) => boolean

    expect(apply({config: {command}, name} as unknown as Environment)).toBe(applies)
  })
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
      parse: parseAst,
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
