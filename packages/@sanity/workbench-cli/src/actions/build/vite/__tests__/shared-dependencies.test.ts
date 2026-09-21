import {describe, expect, test} from 'vitest'

import {
  aliasMayRewriteSharedImport,
  createFederationSharing,
  type FederationSharing,
  findSharedDependencyName,
  type ResolvedDependency,
} from '../shared-dependencies.js'

const REACT_SHARE_SCOPE = 'sanity-react-19.2.0-react-dom-19.2.0-scheduler-0.27.0'

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
    {name: '@sanity/ui', root: '/ui', specifier: '@sanity/ui', version: '4.2.1'},
    {name: '@sanity/ui', root: '/ui', specifier: '@sanity/ui/theme', version: '4.2.1'},
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
    shareScope: REACT_SHARE_SCOPE,
    singleton: false,
    strictVersion: true,
    version,
  }
}

describe('shared dependency policy', () => {
  test('publishes each imported specifier at its exact installed version', () => {
    expect(sharing(dependencies())).toEqual({
      shared: {
        '@sanity/ui': provider('4.2.1'),
        '@sanity/ui/theme': provider('4.2.1'),
        react: provider('19.2.0'),
        'react-dom/client': provider('19.2.0'),
        'react/jsx-runtime': provider('19.2.0'),
        'styled-components': provider('6.1.19'),
      },
      shareScope: [REACT_SHARE_SCOPE],
      shareStrategy: 'loaded-first',
    })
  })

  test('orders providers so repeated builds emit the same chunks', () => {
    expect(Object.keys(sharing(dependencies().toReversed()).shared)).toEqual([
      '@sanity/ui',
      '@sanity/ui/theme',
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'styled-components',
    ])
  })

  test.each(['6.1.19', '6.0.0'])(
    'reuses the same React share scope with styled-components %s',
    (version) => {
      const resolved = dependencies().map((entry) =>
        entry.name === 'styled-components' ? {...entry, version} : entry,
      )
      expect(sharing(resolved).shareScope).toEqual([REACT_SHARE_SCOPE])
    },
  )

  test.each(['4.2.1', '5.0.0'])('reuses the same React share scope with @sanity/ui %s', (version) => {
    const resolved = dependencies().map((entry) =>
      entry.name === '@sanity/ui' ? {...entry, version} : entry,
    )
    expect(sharing(resolved).shareScope).toEqual([REACT_SHARE_SCOPE])
  })

  test.each(['styled-components', '@sanity/ui'])(
    'reuses the same React share scope without %s',
    (name) => {
      const resolved = dependencies().filter((entry) => entry.name !== name)
      expect(sharing(resolved).shareScope).toEqual([REACT_SHARE_SCOPE])
    },
  )

  // `sanity` ships `ui5: npm:@sanity/ui@5` alongside `@sanity/ui@4`, so every studio
  // has two copies; dropping that one package must not cost the app its React share scope.
  test.each(['styled-components', '@sanity/ui'])(
    'keeps the rest of the share scope shared when %s has two copies',
    (name) => {
      const resolved = [...dependencies(), {name, root: `/second/${name}`, version: '9.9.9'}]
      expect(Object.keys(sharing(resolved).shared).some((key) => key.startsWith(name))).toBe(false)
      expect(sharing(resolved).shared).toHaveProperty('react')
      expect(sharing(resolved).shareScope).toEqual([REACT_SHARE_SCOPE])
    },
  )

  // @sanity/ui delivers its theme through styled-components' own context, so a consumed copy
  // would hand the app a theme its local styled-components cannot read.
  test.each([
    {
      reason: 'is not installed',
      resolved: dependencies().filter(({name}) => name !== 'styled-components'),
    },
    {
      reason: 'has two copies',
      resolved: [...dependencies(), {name: 'styled-components', root: '/second', version: '7.0.0'}],
    },
  ])('keeps @sanity/ui local when styled-components $reason', ({resolved}) => {
    expect(sharing(resolved).shared).not.toHaveProperty('@sanity/ui')
    expect(sharing(resolved).shared).toHaveProperty('react')
  })

  test.each([
    {name: 'a local pnpm patch', patch: {root: '/ui_patch_hash=abc'}},
    {name: 'an unsupported version', patch: {version: '4.2.1+build'}},
  ])('keeps the rest of the share scope shared when @sanity/ui has $name', ({patch}) => {
    const resolved = dependencies().map((entry) =>
      entry.name === '@sanity/ui' ? {...entry, ...patch} : entry,
    )
    expect(sharing(resolved).shared).not.toHaveProperty('@sanity/ui')
    expect(sharing(resolved).shared).toHaveProperty('react')
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

test.each([
  {name: 'react', specifier: 'react'},
  {name: 'react', specifier: 'react/jsx-runtime'},
  {name: '@sanity/ui', specifier: '@sanity/ui'},
  {name: '@sanity/ui', specifier: '@sanity/ui/theme'},
  // A stylesheet ships through the expose's own CSS assets; a share scope can only serve modules.
  {name: undefined, specifier: '@sanity/ui/styles.css'},
  {name: undefined, specifier: 'react-dom/client.js'},
  {name: undefined, specifier: 'reactive'},
  {name: undefined, specifier: '@sanity/uid'},
])('shares $specifier as $name', ({name, specifier}) => {
  expect(findSharedDependencyName(specifier)).toBe(name)
})
