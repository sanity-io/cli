// The dev-time HMR contract between a Media Library config app and the Media
// Library host. Background: the host loads the app's federated modules into
// its own page, so the app's Vite client, the generated modules, and the host
// all share one window — they coordinate over window events.
//
// Why events at all: Module Federation always returns the first evaluation of
// a module, so when field modules hot-update, the host cannot simply re-import
// them. Instead the generated `installation_config` module (see `artifact.ts`)
// pushes the fresh namespace to the host and arms a fallback full reload that
// the host cancels by ACKing an in-page apply.
//
// These values are the wire format of that coordination. The host side lives
// in the Media Library app (`fieldModuleHost.ts` in sanity-io/huey, which
// declares its own copies); changing any of them breaks existing hosts, so
// treat them as frozen.

/**
 * Window event the config app dispatches when field modules hot-update.
 * Dispatched twice per edit: once from the generated module's
 * `import.meta.hot.accept` with the fresh namespace as `detail`, and once
 * as a detail-less ping from the `vite:afterUpdate` fallback (the host
 * coalesces both and keeps the payload).
 */
export const MEDIA_LIBRARY_FIELDS_HMR_EVENT = 'sanity:media-library-fields-hmr'

/** Window event the host dispatches after applying an update in place; cancels the fallback reload. */
export const MEDIA_LIBRARY_FIELDS_HMR_ACK = 'sanity:media-library-fields-hmr-ack'

/**
 * How long the config app waits for the host's ACK before falling back to a
 * full page reload. The host defers its apply behind a short debounce (50ms
 * in the Media Library host), so this must stay comfortably above that while
 * still feeling immediate to the developer.
 */
export const FIELDS_HMR_ACK_MS = 500
