import {type Plugin} from 'vite'
import {expect, test} from 'vitest'

import {type FederationSharing} from '../shared-dependencies.js'
import {
  FEDERATION_HOST_ID,
  federationHostModule,
  getFederationHostApi,
  sanityFederationHost,
} from './plugin-federation-host.js'

const POOL = 'sanity-react-19.2.0-react-dom-19.2.0-scheduler-0.27.0'
const EMPTY = 'export const shared = {\n}\n'

const sharing: FederationSharing = {
  shared: {
    react: {
      eager: false,
      requiredVersion: '19.2.0',
      shareScope: POOL,
      singleton: false,
      strictVersion: true,
      version: '19.2.0',
    },
  },
  shareScope: [POOL],
  shareStrategy: 'loaded-first',
}

function load(plugin: Plugin, environment: string): string {
  const resolveId = plugin.resolveId as (id: string) => string
  const loadHook = plugin.load as (this: {environment: {name: string}}, id: string) => string
  return loadHook.call({environment: {name: environment}}, resolveId(FEDERATION_HOST_ID))
}

test('provides the standalone build its own module for each shared specifier', () => {
  expect(federationHostModule(sharing)).toBe(
    `import * as m0 from "react"
export const shared = {
  "react": {...{"scope":["${POOL}"],"shareConfig":{"requiredVersion":"19.2.0","singleton":false,"strictVersion":true},"version":"19.2.0"}, lib: () => m0, loaded: true},
}
`,
  )
})

test.each([
  {environment: 'client', expected: federationHostModule(sharing), provided: sharing},
  {environment: 'federation', expected: EMPTY, provided: sharing},
  // Development builds and builds with sharing disabled
  {environment: 'client', expected: EMPTY, provided: undefined},
])(
  'serves the $environment environment its providers when sharing is $provided',
  ({environment, expected, provided}) => {
    const plugin = sanityFederationHost()
    const host = getFederationHostApi([plugin])
    host?.provide(provided)

    expect(host?.requested).toBe(false)
    expect(load(plugin, environment)).toBe(expected)
    expect(host?.requested).toBe(true)
  },
)
