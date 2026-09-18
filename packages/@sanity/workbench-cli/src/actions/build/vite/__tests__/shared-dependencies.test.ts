import {describe, expect, test} from 'vitest'

import {
  aliasMayRewriteSharedImport,
  createFederationSharing,
  type FederationSharing,
  type ResolvedDependency,
} from '../shared-dependencies.js'

const REACT_POOL = 'sanity-react-19.2.0-react-dom-19.2.0-scheduler-0.27.0'

function dependencies(reactVersion = '19.2.0') {
  return [
    {name: 'react', root: '/react', specifier: 'react', version: reactVersion},
    {name: 'react', root: '/react', specifier: 'react/jsx-runtime', version: reactVersion},
    {name: 'react-dom', root: '/react-dom', specifier: 'react-dom/client', version: reactVersion},
    {name: 'scheduler', root: '/scheduler', specifier: 'scheduler', version: '0.27.0'},
    {
      name: 'styled-components',
      root: '/styled',
      specifier: 'styled-components',
      version: '6.1.19',
    },
    {name: '@sanity/sdk', root: '/sdk', specifier: '@sanity/sdk', version: '3.0.0'},
  ]
}

function sharing(resolved: ResolvedDependency[]): FederationSharing {
  const result = createFederationSharing(resolved)
  if ('disabledReason' in result) throw new Error(`sharing disabled: ${result.disabledReason}`)
  return result
}

function provider(version: string) {
  return {
    eager: false,
    requiredVersion: version,
    shareScope: REACT_POOL,
    singleton: false,
    strictVersion: true,
    version,
  }
}

describe('shared dependency policy', () => {
  test('publishes each imported specifier at its exact installed version', () => {
    expect(sharing(dependencies())).toEqual({
      shared: {
        react: provider('19.2.0'),
        'react-dom/client': provider('19.2.0'),
        'react/jsx-runtime': provider('19.2.0'),
        'styled-components': provider('6.1.19'),
      },
      shareScope: [REACT_POOL],
      shareStrategy: 'loaded-first',
    })
  })

  test('orders providers so repeated builds emit the same chunks', () => {
    expect(Object.keys(sharing(dependencies().toReversed()).shared)).toEqual([
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'styled-components',
    ])
  })

  test.each(['6.1.19', '6.0.0'])(
    'reuses the same React pool with styled-components %s',
    (version) => {
      const resolved = dependencies().map((entry) =>
        entry.name === 'styled-components' ? {...entry, version} : entry,
      )
      expect(sharing(resolved).shareScope).toEqual([REACT_POOL])
    },
  )

  test('reuses the same React pool without styled-components', () => {
    const resolved = dependencies().filter(({name}) => name !== 'styled-components')
    expect(sharing(resolved).shareScope).toEqual([REACT_POOL])
  })

  test.each(['react', 'react-dom', 'scheduler'])(
    'keeps an incomplete %s peer group local',
    (name) => {
      expect(
        createFederationSharing(dependencies().filter((entry) => entry.name !== name)),
      ).toEqual({disabledReason: `No installed copy of ${name} was found`})
    },
  )

  test.each(['19.2.0+patched', '19.2.0-01'])('keeps uncertain version %s local', (version) => {
    expect(createFederationSharing(dependencies(version))).toEqual({
      disabledReason: `react has an unsupported version: ${JSON.stringify(version)}`,
    })
  })

  test('keeps mismatched React and React DOM versions local', () => {
    expect(
      createFederationSharing(
        dependencies().map((entry) =>
          entry.name === 'react-dom' ? {...entry, version: '19.2.1'} : entry,
        ),
      ),
    ).toEqual({disabledReason: 'React (19.2.0) and React DOM (19.2.1) versions differ'})
  })

  test('keeps the renderer local when the React root import was intercepted', () => {
    expect(
      createFederationSharing(dependencies().filter(({specifier}) => specifier !== 'react')),
    ).toEqual({disabledReason: 'The react import could not be resolved to a shared provider'})
  })

  test('keeps duplicate installations of the same version local', () => {
    expect(
      createFederationSharing([
        ...dependencies(),
        {name: 'react', root: '/other/react', version: '19.2.0'},
      ]),
    ).toEqual({disabledReason: 'Multiple installed copies of react were found'})
  })

  test('keeps patched packages local', () => {
    expect(
      createFederationSharing(
        dependencies().map((entry) => ({...entry, root: `${entry.root}_patch_hash=abc`})),
      ),
    ).toEqual({disabledReason: 'react has a local pnpm patch'})
  })
})

test.each([
  {alias: /^@app\//, rewrites: false},
  {alias: /^\/?@vite\/client/, rewrites: false},
  {alias: 'my-lib', rewrites: false},
  {alias: 'react-dom/client', rewrites: true},
  {alias: /^react\//, rewrites: true},
  {alias: /^@app\/|react/, rewrites: true},
  {alias: /^rea\/?ct/, rewrites: true},
  {alias: /^@app\//i, rewrites: true},
])('alias $alias may rewrite a shared import: $rewrites', ({alias, rewrites}) => {
  expect(aliasMayRewriteSharedImport(alias)).toBe(rewrites)
})
