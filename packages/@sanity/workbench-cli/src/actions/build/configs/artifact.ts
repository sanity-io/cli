import {INSTALLATION_CONFIG_TYPE, MEDIA_LIBRARY_CONFIG_CONTRACT_VERSION} from '../../../contract.js'
import {type GeneratedArtifact} from '../artifact.js'
import {MEDIA_LIBRARY_ISLAND_RUNTIME_MODULE} from './mediaLibraryIslandRuntime.js'

const CONFIGS_DIR_NAME = 'configs'

/**
 * The Media Library config to generate a module for.
 * @internal
 */
export interface MediaLibraryConfigArtifact {
  fields: {name: string; public?: boolean; src: string; title: string}[]
}

/** Build-time capabilities that gate optional Media Library config artifacts. */
export interface MediaLibraryConfigArtifactOptions {
  /**
   * Whether the app's installed `sanity` ships the Media Library island-mount
   * runtime ({@link MEDIA_LIBRARY_ISLAND_RUNTIME_MODULE}). Gates the
   * `./media-library-island-runtime` expose — emitting it against an older
   * `sanity` would fail the build on an unresolvable import.
   */
  islandRuntime?: boolean
}

/**
 * Expand the Media Library config into its federation modules: one aggregating
 * all fields (so the host imports one live config value), plus — when the
 * installed `sanity` ships it — the island-mount runtime the host uses to
 * render custom field inputs in isolated React roots.
 *
 * Everything here is Media Library-specific (the one config type today);
 * a second config type gets its own expander next to this one.
 */
export function mediaLibraryConfigArtifacts(
  config: MediaLibraryConfigArtifact | undefined,
  options: MediaLibraryConfigArtifactOptions = {},
): GeneratedArtifact[] {
  if (!config) return []
  return [
    {
      expose: `./${CONFIGS_DIR_NAME}/${INSTALLATION_CONFIG_TYPE}`,
      path: `${CONFIGS_DIR_NAME}/${INSTALLATION_CONFIG_TYPE}.js`,
      source: ({resolveImport}) => mediaLibraryConfigSource({config, resolveImport}),
    },
    ...(options.islandRuntime
      ? [
          {
            expose: './media-library-island-runtime',
            path: `${CONFIGS_DIR_NAME}/media_library_island_runtime.js`,
            source: () => mediaLibraryIslandRuntimeSource(),
          },
        ]
      : []),
  ]
}

/**
 * Emits `export const config`: each field's serializable `{name, title, public}`
 * plus its live `defineField` value, the one thing the wire can't carry.
 * `appType` stays off the module — the host assigns it from the wire record.
 */
function mediaLibraryConfigSource(input: {
  config: MediaLibraryConfigArtifact
  resolveImport: (src: string) => string
}): string {
  const {config, resolveImport} = input
  const imports = config.fields
    .map((field, index) => `import field_${index} from ${JSON.stringify(resolveImport(field.src))}`)
    .join('\n')
  const entries = config.fields
    .map(
      (field, index) =>
        `    {name: ${JSON.stringify(field.name)}, title: ${JSON.stringify(field.title)}, ` +
        `public: ${JSON.stringify(Boolean(field.public))}, config: field_${index}},`,
    )
    .join('\n')
  return `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
${imports}

export const type = ${JSON.stringify(INSTALLATION_CONFIG_TYPE)}
export const version = ${MEDIA_LIBRARY_CONFIG_CONTRACT_VERSION}
export const config = {
  fields: [
${entries}
  ],
}

// Dev-only HMR handle. In dev the Media Library host loads this module into
// its own page through Module Federation, which keeps returning the first
// evaluation — the host cannot re-import its way to fresh code. So the host
// registers a listener here instead: on every hot update the outgoing module
// hands its live listener set to the incoming module, then replays the
// listeners with the fresh namespace, and the host re-applies the field
// config in place (the same pattern view remotes use). When nobody is
// listening — or a listener fails to apply — invalidate() escalates to
// Vite's native full reload, so the page can never keep rendering from
// stale config.
let listeners = new Set()
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
// Internal to the hot chain: the set object travels across updates so the
// unsubscribe closures handed out by any module generation keep deleting
// from the one live set (a copy would orphan them after the first update).
export function _adoptListeners(shared) {
  listeners = shared
}

if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (!next || typeof next._adoptListeners !== 'function' || listeners.size === 0) {
      import.meta.hot.invalidate()
      return
    }
    try {
      next._adoptListeners(listeners)
      // Notify a snapshot: a listener may unsubscribe and re-subscribe on the
      // fresh namespace, which (post-adoption) mutates this very set — and a
      // Set iterator revisits re-added entries, so iterating live would loop
      // forever. Entries added mid-loop subscribed to the already-current
      // namespace and need no notification for this update.
      for (const listener of [...listeners]) {
        listener(next)
      }
    } catch {
      import.meta.hot.invalidate()
    }
  })
}
`
}

/**
 * One line on purpose: the runtime implementation lives in the `sanity`
 * package and is bundled into the remote from the app's own install, so the
 * runtime always matches the `sanity` version field modules compile against.
 */
function mediaLibraryIslandRuntimeSource(): string {
  return `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
export * from ${JSON.stringify(MEDIA_LIBRARY_ISLAND_RUNTIME_MODULE)}
`
}
