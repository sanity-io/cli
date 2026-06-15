import {type DevServerInterface} from './deriveInterfaces.js'

/**
 * The identity of an app's declared interface set — an order-independent key
 * over its forwarded Interface records (interface_type, name, entry_point).
 * Two sets that differ only in declaration order share an id, so reordering
 * `views`/`services` in `sanity.cli.ts` is not a change; adding, removing,
 * renaming, or repointing a view/service is. `undefined` (project types that
 * declare no interfaces, e.g. studios) ids to the empty set.
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
 * Track the declared interface *set* across config reloads. The returned
 * predicate reports `true` the first time it sees a set whose id differs from
 * the previous one — an added, removed, renamed, or repointed view/service —
 * and `false` for a reorder or a manifest-only/source-file edit (the set is
 * unchanged, so HMR handles it). Seed it with the initially registered set.
 */
export function trackInterfaceSet(
  initial: readonly DevServerInterface[] | undefined,
): (interfaces: readonly DevServerInterface[] | undefined) => boolean {
  let lastId = interfaceSetId(initial)
  return (interfaces) => {
    const id = interfaceSetId(interfaces)
    if (id === lastId) return false
    lastId = id
    return true
  }
}
