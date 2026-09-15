import {assert, describe, expect, test} from 'vitest'

import {createFederationSharing} from '../shared-dependencies.js'

function dependencies(reactVersion = '19.2.0', styledVersion = '6.1.19') {
  return [
    {name: 'react', root: '/react', specifier: 'react', version: reactVersion},
    {name: 'react', root: '/react', specifier: 'react/jsx-runtime', version: reactVersion},
    {name: 'react-dom', root: '/react-dom', specifier: 'react-dom/client', version: reactVersion},
    {name: 'scheduler', root: '/scheduler', specifier: 'scheduler', version: '0.27.0'},
    {
      name: 'styled-components',
      root: '/styled',
      specifier: 'styled-components',
      version: styledVersion,
    },
    {name: '@sanity/sdk', root: '/sdk', specifier: '@sanity/sdk', version: '3.0.0'},
  ]
}

describe('shared dependency policy', () => {
  test('produces the same provider order regardless of discovery order', () => {
    expect(JSON.stringify(createFederationSharing(dependencies().toReversed()))).toBe(
      JSON.stringify(createFederationSharing(dependencies())),
    )
  })

  test('shares consumed entrypoints lazily with exact versions in one scope', () => {
    const reactProvider = {
      eager: false,
      requiredVersion: '19.2.0',
      shareScope: 'sanity-react-19.2.0-react-dom-19.2.0-scheduler-0.27.0-styled-components-6.1.19',
      singleton: false,
      strictVersion: true,
      version: '19.2.0',
    }
    expect(createFederationSharing(dependencies())).toEqual({
      shared: {
        react: reactProvider,
        'react-dom/client': reactProvider,
        'react/jsx-runtime': reactProvider,
        'styled-components': {...reactProvider, requiredVersion: '6.1.19', version: '6.1.19'},
      },
      shareScope: 'sanity-react-19.2.0-react-dom-19.2.0-scheduler-0.27.0-styled-components-6.1.19',
      shareStrategy: 'loaded-first',
    })
  })

  test.each<[string, Record<string, string>]>([
    ['React', {react: '19.2.1', 'react-dom': '19.2.1'}],
    ['scheduler', {scheduler: '0.27.1'}],
    ['styled-components', {'styled-components': '6.1.20'}],
  ])('separates apps with a different %s patch version', (_name, overrides) => {
    const changed = dependencies().map((entry) => ({
      ...entry,
      version: overrides[entry.name] ?? entry.version,
    }))
    const sharing = createFederationSharing(changed)
    assert(sharing)
    expect(sharing.shareScope).not.toBe(
      'sanity-react-19.2.0-react-dom-19.2.0-scheduler-0.27.0-styled-components-6.1.19',
    )
  })

  test('does not require styled-components for React sharing', () => {
    const sharing = createFederationSharing(
      dependencies().filter(({name}) => name !== 'styled-components'),
    )
    assert(sharing)
    expect(sharing.shareScope).toContain('-styled-components-none')
    expect(sharing.shared).not.toHaveProperty('styled-components')
  })

  test.each(['react', 'react-dom', 'scheduler'])(
    'keeps an incomplete %s peer group local',
    (name) => {
      expect(
        createFederationSharing(dependencies().filter((entry) => entry.name !== name)),
      ).toBeUndefined()
    },
  )

  test.each(['^19.2.0', '', '19.2.0+patched', '19.2.0-01'])(
    'keeps uncertain version %s local',
    (version) => {
      expect(createFederationSharing(dependencies(version))).toBeUndefined()
    },
  )

  test('keeps multiple installed copies local', () => {
    expect(
      createFederationSharing([...dependencies(), {...dependencies()[0], root: '/nested/react'}]),
    ).toBeUndefined()
  })

  test('keeps mismatched React and React DOM versions local', () => {
    expect(
      createFederationSharing(
        dependencies().map((entry) =>
          entry.name === 'react-dom' ? {...entry, version: '19.2.1'} : entry,
        ),
      ),
    ).toBeUndefined()
  })

  test('keeps the renderer local when the React root import was intercepted', () => {
    expect(
      createFederationSharing(dependencies().filter(({specifier}) => specifier !== 'react')),
    ).toBeUndefined()
  })

  test('keeps patched packages local', () => {
    expect(
      createFederationSharing(
        dependencies().map((entry) => ({...entry, root: `${entry.root}_patch_hash=abc`})),
      ),
    ).toBeUndefined()
  })

  test('shares additional consumed subpaths without adding unused ones', () => {
    const entries = dependencies()
    entries.push({...entries[0], specifier: 'react/compiler-runtime'})
    expect(createFederationSharing(entries)!.shared).toHaveProperty('react/compiler-runtime')
    expect(createFederationSharing(dependencies('18.3.1'))!.shared).not.toHaveProperty(
      'react/compiler-runtime',
    )
  })
})
