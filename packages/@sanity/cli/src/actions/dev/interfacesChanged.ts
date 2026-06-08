import {type DevServerInterface} from './deriveInterfaces.js'

/**
 * Order-independent string key for a declared interface set. Two sets that
 * differ only in declaration order produce the same key, so reordering
 * `views`/`services` in `sanity.cli.ts` does not count as a change. `undefined`
 * (project types that declare no interfaces, e.g. studios) keys to the empty set.
 */
export function serializeInterfaces(interfaces: readonly DevServerInterface[] | undefined): string {
  if (!interfaces || interfaces.length === 0) return ''
  return interfaces
    .map((iface) => [iface.interface_type, iface.name, iface.entry_point].join('::'))
    .toSorted()
    .join('|')
}

/**
 * Whether the declared interface set changed between two registry snapshots.
 *
 * A change here means a view/service was added, removed, renamed, or repointed
 * in `sanity.cli.ts` — which requires the federation remote to be rebuilt (its
 * `exposes` map + codegen artifacts are computed once at server start, so a new
 * interface has no expose until the server is recreated). Editing a view's or
 * service's *source file* does NOT change this set, so it stays on the HMR path.
 */
export function interfacesChanged(
  a: readonly DevServerInterface[] | undefined,
  b: readonly DevServerInterface[] | undefined,
): boolean {
  return serializeInterfaces(a) !== serializeInterfaces(b)
}
