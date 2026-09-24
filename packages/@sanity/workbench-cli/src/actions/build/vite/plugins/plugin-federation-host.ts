import {type Plugin} from 'vite'

import {type FederationSharing} from '../shared-dependencies.js'

export const FEDERATION_HOST_ID = 'virtual:sanity/federation-host'
const RESOLVED_ID = `\0${FEDERATION_HOST_ID}`

export interface FederationHostApi {
  requested: boolean

  sharing?: FederationSharing
}

export function getFederationHostApi(plugins: readonly Plugin[]): FederationHostApi | undefined {
  return plugins.find((plugin) => plugin.api?.sanityFederationHost)?.api.sanityFederationHost
}

// Hands the standalone build's own copies of shared dependencies to the apps it loads: its SPA
// never initializes a federation container, so each app would otherwise download a second copy.
export function sanityFederationHost(): Plugin {
  const api: FederationHostApi = {requested: false}
  return {
    api: {sanityFederationHost: api},
    load(id) {
      if (id !== RESOLVED_ID) return
      api.requested = true
      return federationHostModule(this.environment.name === 'client' ? api.sharing : undefined)
    },
    name: 'sanity/federation-host',
    resolveId: (id) => (id === FEDERATION_HOST_ID ? RESOLVED_ID : undefined),
  }
}

function federationHostModule(sharing: FederationSharing | undefined): string {
  const entries = Object.entries(sharing?.shared ?? {})
  const imports = entries.map(
    ([specifier], index) => `import * as m${index} from ${JSON.stringify(specifier)}\n`,
  )
  const providers = entries.map(([specifier, entry], index) => {
    const {requiredVersion, shareScope, singleton, strictVersion, version} = entry
    const options = {
      scope: [shareScope],
      shareConfig: {requiredVersion, singleton, strictVersion},
      version,
    }
    return `  ${JSON.stringify(specifier)}: {...${JSON.stringify(options)}, lib: () => m${index}, loaded: true},\n`
  })
  return `${imports.join('')}export const shared = {\n${providers.join('')}}\n`
}
