import {describe, expect, test} from 'vitest'

import {aliasMayRewriteSharedImport, createFederationSharing} from '../shared-dependencies.js'

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

describe('shared dependency policy', () => {
  test.each(['react', 'react-dom', 'scheduler'])(
    'keeps an incomplete %s peer group local',
    (name) => {
      expect(
        createFederationSharing(dependencies().filter((entry) => entry.name !== name)),
      ).toBeUndefined()
    },
  )

  test.each(['19.2.0+patched', '19.2.0-01'])('keeps uncertain version %s local', (version) => {
    expect(createFederationSharing(dependencies(version))).toBeUndefined()
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
})

test.each([/^@app\/|react/, /^rea\/?ct/])(
  'keeps ambiguous or shared-subpath aliases conservative: %s',
  (alias) => {
    expect(aliasMayRewriteSharedImport(alias)).toBe(true)
  },
)
