import {type DevServerInterface} from './deriveInterfaces.js'
import {type DevServerManifest} from './registry.js'

/**
 * Order-independent identity of an app's interface set. Reordering
 * `views`/`services` keeps the same id (not a change); adding, removing,
 * renaming, or repointing one changes it. `undefined` ids to the empty set.
 */
export function interfaceSetId(interfaces: readonly DevServerInterface[] | undefined): string {
  if (!interfaces || interfaces.length === 0) return ''
  return interfaces
    .map((iface) => [iface.interface_type, iface.name, iface.entry_point].join('::'))
    .toSorted()
    .join('|')
}

/**
 * Tracks one app's interface set across config reloads. `changed` and `commit`
 * are split so the caller commits only after the rebuild that depends on the new
 * set succeeds — a thrown rebuild leaves it uncommitted, so the next save retries
 * instead of skipping. Seed with the initially registered set.
 */
export function trackInterfaceSet(initial: readonly DevServerInterface[] | undefined): {
  changed: (interfaces: readonly DevServerInterface[] | undefined) => boolean
  commit: (interfaces: readonly DevServerInterface[] | undefined) => void
} {
  let lastId = interfaceSetId(initial)
  return {
    changed: (interfaces) => interfaceSetId(interfaces) !== lastId,
    commit: (interfaces) => {
      lastId = interfaceSetId(interfaces)
    },
  }
}

const serverKey = (server: DevServerManifest): string =>
  `${server.id ?? ''}@${server.host ?? ''}:${server.port}`

/**
 * Tracks every registered app's interface set across registry snapshots (the
 * multi-app counterpart to {@link trackInterfaceSet}). `hasChanged` is true when
 * a *known* app's set changed since the last call — its remote was rebuilt with
 * new exposes, so the workbench must full-reload to drop the stale remote-entry.
 * A new/removed app or manifest-only edit isn't a rebuild.
 */
export function createInterfacesTracker(): {
  hasChanged: (servers: readonly DevServerManifest[]) => boolean
} {
  let known = new Map<string, string>()
  return {
    hasChanged(servers) {
      const rebuilt = servers.some((server) => {
        const key = serverKey(server)
        return known.has(key) && known.get(key) !== interfaceSetId(server.interfaces)
      })
      known = new Map(
        servers.map((server) => [serverKey(server), interfaceSetId(server.interfaces)]),
      )
      return rebuilt
    },
  }
}
