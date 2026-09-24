import {createInstance} from '@module-federation/runtime'
import {expect, test} from 'vitest'

import {evaluateHostModule} from '../__tests__/federationHostTestHelpers.js'
import {type FederationSharing} from '../shared-dependencies.js'
import {
  FEDERATION_HOST_ID,
  getFederationHostApi,
  sanityFederationHost,
} from './plugin-federation-host.js'

const SHARE_SCOPE = 'sanity-react-19.2.0-react-dom-19.2.0-scheduler-0.27.0'
const HOST_REACT = {copy: 'the host React'}

const sharing: FederationSharing = {
  shared: {
    react: {
      eager: false,
      requiredVersion: '19.2.0',
      shareScope: SHARE_SCOPE,
      singleton: false,
      strictVersion: true,
      version: '19.2.0',
    },
  },
  shareScope: [SHARE_SCOPE],
  shareStrategy: 'loaded-first',
}

function setUpHost(sharing: FederationSharing | undefined) {
  const plugin = sanityFederationHost()
  const host = getFederationHostApi([plugin])
  if (!host) throw new Error('the plugin exposes no host api')
  host.sharing = sharing
  const resolveId = plugin.resolveId as (id: string) => string
  const loadHook = plugin.load as (this: {environment: {name: string}}, id: string) => string
  const load = (environment: string) =>
    loadHook.call({environment: {name: environment}}, resolveId(FEDERATION_HOST_ID))
  return {host, load}
}

test('an app joining the host share scope takes the host copy instead of fetching its own', async () => {
  const shared = evaluateHostModule(setUpHost(sharing).load('client'), {react: HOST_REACT})
  const host = createInstance({name: 'shell', remotes: [], shared, shareStrategy: 'loaded-first'})
  const app = createInstance({
    name: 'app',
    remotes: [],
    shared: {
      react: {
        get: () => {
          throw new Error('the app fetched its own React')
        },
        scope: [SHARE_SCOPE],
        shareConfig: {requiredVersion: '19.2.0', singleton: false, strictVersion: true},
        version: '19.2.0',
      },
    },
    shareStrategy: 'loaded-first',
  })
  app.initShareScopeMap(SHARE_SCOPE, host.shareScopeMap[SHARE_SCOPE])

  const factory = await app.loadShare('react')
  expect(factory && factory()).toBe(HOST_REACT)
})

test("imports a transitive provider's fallback from the resolved file", () => {
  const resolvedGroq = {copy: 'the resolved groq-js'}
  const entry = {...sharing.shared.react, import: '/groq/dist/index.js', version: '2.0.0'}
  const {load} = setUpHost({...sharing, shared: {'groq-js': entry}})

  const shared = evaluateHostModule(load('client'), {'/groq/dist/index.js': resolvedGroq})
  expect(shared['groq-js'].lib()).toBe(resolvedGroq)
})

test.each([
  [
    'hands the standalone build its providers once sharing has settled',
    'client',
    sharing,
    ['react'],
  ],
  [
    'hands the federation build an empty map, since it shares through its container',
    'federation',
    sharing,
    [],
  ],
  ['hands out an empty map in development and when sharing is disabled', 'client', undefined, []],
] as const)('%s', (_name, environment, provided, expected) => {
  const {host, load} = setUpHost(provided)

  expect(host.requested).toBe(false)
  expect(Object.keys(evaluateHostModule(load(environment)))).toEqual(expected)
  expect(host.requested).toBe(true)
})
