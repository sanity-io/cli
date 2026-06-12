import {type DevServerInterface} from './deriveInterfaces.js'

/**
 * The identity of an app's declared interface set — an order-independent key
 * over its forwarded Interface records (interface_type, name, entry_point).
 * Two sets that differ only in declaration order share an id, so reordering
 * `views`/`services` in `sanity.cli.ts` is not a change; adding, removing,
 * renaming, or repointing a view/service is. An `undefined` set (project types
 * that declare no interfaces, e.g. studios) gets the same id as the empty set.
 *
 * Both detection sites compare this id against their own last-seen value across
 * the dev-server registry seam: the app dev server rebuilds the federation
 * remote when its set changes, and the workbench dev server reloads the page.
 * Editing a view's/service's *source file* doesn't change the id, so it stays
 * on the HMR path.
 */
export function interfaceSetId(interfaces: readonly DevServerInterface[] | undefined): string {
  if (!interfaces || interfaces.length === 0) return ''
  return interfaces
    .map((iface) => [iface.interface_type, iface.name, iface.entry_point].join('::'))
    .toSorted()
    .join('|')
}

/**
 * Track the declared interface *set* across config reloads — an added, removed,
 * renamed, or repointed view/service. `changed` reports whether a set differs
 * from the last *committed* one (a reorder or manifest-only/source-file edit
 * leaves it unchanged, so HMR handles it) without advancing the committed set;
 * `commit` advances it. Splitting the two lets the caller commit only after the
 * rebuild that depends on the new set has succeeded — a thrown rebuild leaves
 * the set uncommitted, so the next config save retries it instead of skipping.
 * Seed it with the initially registered set.
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
