import {describe, expect, test} from 'vitest'

import {
  aliasMayRewriteSharedImport,
  createFederationSharing,
  type FederationSharing,
  findSharedDependencyName,
  type ResolvedDependency,
} from '../shared-dependencies.js'

const REACT_SHARE_SCOPE = 'sanity-react-19.2.0-react-dom-19.2.0-scheduler-0.27.0'
const SANITY_UI_SHARE_SCOPE = `${REACT_SHARE_SCOPE}-styled-components-6.1.19`
// @sanity/ui 4 peers on styled-components, which pins its share scope to the styled-components version.
const UI_PEERS = ['react', 'react-dom', 'styled-components']

function dependencies(reactVersion = '19.2.0'): ResolvedDependency[] {
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
    {name: '@sanity/ui', peers: UI_PEERS, root: '/ui', specifier: '@sanity/ui', version: '4.2.1'},
    {
      name: '@sanity/ui',
      peers: UI_PEERS,
      root: '/ui',
      specifier: '@sanity/ui/theme',
      version: '4.2.1',
    },
    {name: '@sanity/sdk', root: '/sdk', specifier: '@sanity/sdk', version: '3.0.0'},
  ]
}

function withPackage(name: string, patch: Partial<ResolvedDependency>): ResolvedDependency[] {
  return dependencies().map((entry) => (entry.name === name ? {...entry, ...patch} : entry))
}

function withoutPackage(name: string): ResolvedDependency[] {
  return dependencies().filter((entry) => entry.name !== name)
}

function sharing(resolved: ResolvedDependency[]): FederationSharing {
  const result = createFederationSharing(resolved)
  if ('disabledReason' in result) throw new Error(`sharing disabled: ${result.disabledReason}`)
  return result
}

// Maps each published specifier to its share scope, so one assertion shows what is shared and with whom.
function shareScopes(resolved: ResolvedDependency[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(sharing(resolved).shared).map(([specifier, {shareScope}]) => [
      specifier,
      shareScope,
    ]),
  )
}

function provider(version: string, shareScope: string) {
  return {
    eager: false,
    requiredVersion: version,
    shareScope,
    singleton: false,
    strictVersion: true,
    version,
  }
}

const REACT_ONLY = {
  react: REACT_SHARE_SCOPE,
  'react-dom/client': REACT_SHARE_SCOPE,
  'react/jsx-runtime': REACT_SHARE_SCOPE,
}
const WITHOUT_SANITY_UI = {...REACT_ONLY, 'styled-components': REACT_SHARE_SCOPE}

describe('shared dependency policy', () => {
  test('publishes each imported specifier at its exact installed version', () => {
    expect(sharing(dependencies())).toEqual({
      shared: {
        '@sanity/ui': provider('4.2.1', SANITY_UI_SHARE_SCOPE),
        '@sanity/ui/theme': provider('4.2.1', SANITY_UI_SHARE_SCOPE),
        react: provider('19.2.0', REACT_SHARE_SCOPE),
        'react-dom/client': provider('19.2.0', REACT_SHARE_SCOPE),
        'react/jsx-runtime': provider('19.2.0', REACT_SHARE_SCOPE),
        'styled-components': provider('6.1.19', REACT_SHARE_SCOPE),
      },
      shareScope: [REACT_SHARE_SCOPE, SANITY_UI_SHARE_SCOPE],
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

  // A consumer takes @sanity/ui together with the provider's styled-components, so the theme
  // only reaches the consumer's own `styled` components when both apps agree on its version.
  test('names the @sanity/ui share scope after the styled-components version and keeps the React share scope', () => {
    const pinned = `${REACT_SHARE_SCOPE}-styled-components-6.5.2`
    expect(shareScopes(withPackage('styled-components', {version: '6.5.2'}))).toEqual({
      ...WITHOUT_SANITY_UI,
      '@sanity/ui': pinned,
      '@sanity/ui/theme': pinned,
    })
  })

  test('shares a @sanity/ui without a styled-components peer in the React share scope', () => {
    const resolved = withPackage('@sanity/ui', {
      peers: ['react', 'react-dom'],
      version: '5.0.0',
    }).filter(({name}) => name !== 'styled-components')
    expect(shareScopes(resolved)).toEqual({
      ...REACT_ONLY,
      '@sanity/ui': REACT_SHARE_SCOPE,
      '@sanity/ui/theme': REACT_SHARE_SCOPE,
    })
  })

  test('puts different @sanity/ui versions in the same share scope', () => {
    expect(shareScopes(withPackage('@sanity/ui', {version: '5.0.0'}))).toEqual(
      shareScopes(dependencies()),
    )
  })

  test('makes the React share scope the container default', () => {
    expect(sharing(dependencies()).shareScope?.[0]).toBe(REACT_SHARE_SCOPE)
  })

  test('shares only the React share scope when only React is installed', () => {
    const resolved = withoutPackage('styled-components').filter(({name}) => name !== '@sanity/ui')
    expect(shareScopes(resolved)).toEqual(REACT_ONLY)
    expect(sharing(resolved).shareScope).toEqual([REACT_SHARE_SCOPE])
  })

  test.each([
    {reason: 'is not installed', resolved: withoutPackage('styled-components')},
    {
      reason: 'has two copies',
      resolved: [...dependencies(), {name: 'styled-components', root: '/second', version: '7.0.0'}],
    },
    {
      reason: 'has a local pnpm patch',
      resolved: withPackage('styled-components', {root: '/styled_patch_hash=abc'}),
    },
    {
      reason: 'has build metadata in its version',
      resolved: withPackage('styled-components', {version: '6.1.19+local'}),
    },
  ])(
    'keeps styled-components and @sanity/ui local when styled-components $reason',
    ({resolved}) => {
      expect(shareScopes(resolved)).toEqual(REACT_ONLY)
    },
  )

  // `sanity` ships `ui5: npm:@sanity/ui@5` alongside `@sanity/ui@4`, so every studio has two
  // copies; an optional package that cannot be shared must not cost the app its React share scope.
  test('keeps only @sanity/ui local when it has two copies', () => {
    const resolved = [...dependencies(), {name: '@sanity/ui', root: '/ui5', version: '5.0.0'}]
    expect(shareScopes(resolved)).toEqual(WITHOUT_SANITY_UI)
    expect(sharing(resolved).shareScope).toEqual([REACT_SHARE_SCOPE])
  })

  // Discovery reports a copy without a specifier when the project root cannot provide it.
  test('publishes no provider or share scope for a copy the project root cannot provide', () => {
    const resolved = [
      ...withoutPackage('@sanity/ui'),
      {name: '@sanity/ui', root: '/ui', version: '4.2.1'},
    ]
    expect(shareScopes(resolved)).toEqual(WITHOUT_SANITY_UI)
    expect(sharing(resolved).shareScope).toEqual([REACT_SHARE_SCOPE])
  })

  test.each(['react', 'react-dom', 'scheduler'])(
    'keeps an incomplete %s peer group local',
    (name) => {
      expect(createFederationSharing(withoutPackage(name))).toEqual({
        disabledReason: `No installed copy of ${name} was found`,
      })
    },
  )

  test.each(['19.2.0+patched', '19.2.0-01'])('keeps uncertain version %s local', (version) => {
    expect(createFederationSharing(dependencies(version))).toEqual({
      disabledReason: `react has an unsupported version: ${JSON.stringify(version)}`,
    })
  })

  test('keeps mismatched React and React DOM versions local', () => {
    expect(createFederationSharing(withPackage('react-dom', {version: '19.2.1'}))).toEqual({
      disabledReason: 'React (19.2.0) and React DOM (19.2.1) versions differ',
    })
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
])('resolves $specifier to the shared package $name', ({name, specifier}) => {
  expect(findSharedDependencyName(specifier)).toBe(name)
})

test.each([
  // A stylesheet ships through the expose's own CSS assets; a share scope can only serve modules.
  '@sanity/ui/styles.css',
  'react-dom/client.js',
  'reactive',
  '@sanity/uid',
])('does not share %s', (specifier) => {
  expect(findSharedDependencyName(specifier)).toBeUndefined()
})
