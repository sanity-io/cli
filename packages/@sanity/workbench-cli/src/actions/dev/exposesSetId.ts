import {
  deriveInstallationConfigEntries,
  type DevServerConfig,
  type DevServerInterface,
} from './deriveInterfaces.js'
import {type DevServerManifest} from './registry.js'

interface ExposeSet {
  installationConfigs?: readonly DevServerConfig[] | undefined
  interfaces?: readonly DevServerInterface[] | undefined
}

/**
 * Order-independent id of an app's exposed-module set. Keys each interface by
 * its type, name, and source file, and each installation config by its module
 * identity plus one key per entry (a named source file), so the id changes on
 * any rebuild-worthy edit — add, remove, rename, repoint, or gaining/losing the
 * config module — while reordering and HMR content edits keep it stable.
 */
export function exposesSetId({installationConfigs, interfaces}: ExposeSet): string {
  const keys = [
    ...(interfaces ?? []).map((iface) =>
      [iface.interface_type, iface.name, iface.entry_point].join('::'),
    ),
    ...(installationConfigs ?? []).flatMap((config) => [
      ['config', config.appType].join('::'),
      ...deriveInstallationConfigEntries(config).map((entry) =>
        ['config', config.appType, entry.name, entry.src].join('::'),
      ),
    ]),
  ]
  if (keys.length === 0) return ''
  return keys.toSorted().join('|')
}

/**
 * `changed`/`commit` are split so the caller commits only after the rebuild that
 * depends on the new set succeeds — a thrown rebuild retries on the next save.
 */
export function trackExposesSet(initial: ExposeSet): {
  changed: (next: ExposeSet) => boolean
  commit: (next: ExposeSet) => void
} {
  let lastId = exposesSetId(initial)
  return {
    changed: (next) => exposesSetId(next) !== lastId,
    commit: (next) => {
      lastId = exposesSetId(next)
    },
  }
}

const serverKey = (server: DevServerManifest): string =>
  `${server.id ?? ''}@${server.host ?? ''}:${server.port}`

const serverExposesId = (server: DevServerManifest): string =>
  exposesSetId({installationConfigs: server.installationConfigs, interfaces: server.interfaces})

/**
 * Multi-app counterpart to {@link trackExposesSet}: true when a *known* app's
 * set changed — its remote was rebuilt, so the workbench must full-reload to
 * drop the stale remote-entry. A new/removed app isn't a rebuild.
 */
export function createExposesTracker(): {
  hasChanged: (servers: readonly DevServerManifest[]) => boolean
} {
  let known = new Map<string, string>()
  return {
    hasChanged(servers) {
      const rebuilt = servers.some((server) => {
        const key = serverKey(server)
        return known.has(key) && known.get(key) !== serverExposesId(server)
      })
      known = new Map(servers.map((server) => [serverKey(server), serverExposesId(server)]))
      return rebuilt
    },
  }
}
