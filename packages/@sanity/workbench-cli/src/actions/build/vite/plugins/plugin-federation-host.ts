import {type Plugin} from 'vite'

import {type FederationSharing} from '../shared-dependencies.js'

export const FEDERATION_HOST_ID = 'virtual:sanity/federation-host'
const RESOLVED_ID = `\0${FEDERATION_HOST_ID}`

export interface FederationHostApi {
  provide: (sharing: FederationSharing | undefined) => void
  readonly requested: boolean
}

export function getFederationHostApi(plugins: readonly Plugin[]): FederationHostApi | undefined {
  return plugins.find((plugin) => plugin.api?.sanityFederationHost)?.api.sanityFederationHost
}

// Hands the standalone build's own copies of shared dependencies to the apps it loads: its SPA
// never initializes a federation container, so each app would otherwise download a second copy.
export function sanityFederationHost(): Plugin {
  let sharing: FederationSharing | undefined
  let requested = false
  const api: FederationHostApi = {
    provide: (next) => {
      sharing = next
    },
    get requested() {
      return requested
    },
  }
  return {
    api: {sanityFederationHost: api},
    load(id) {
      if (id !== RESOLVED_ID) return
      requested = true
      return federationHostModule(this.environment.name === 'client' ? sharing : undefined)
    },
    name: 'sanity/federation-host',
    resolveId: (id) => (id === FEDERATION_HOST_ID ? RESOLVED_ID : undefined),
  }
}

export function federationHostModule(sharing: FederationSharing | undefined): string {
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
