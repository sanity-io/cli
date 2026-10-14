import {INSTALLATION_CONFIG_TYPE, MEDIA_LIBRARY_CONFIG_CONTRACT_VERSION} from '../../../contract.js'
import {type GeneratedArtifact} from '../artifact.js'
import {
  FIELDS_HMR_ACK_MS,
  MEDIA_LIBRARY_FIELDS_HMR_ACK,
  MEDIA_LIBRARY_FIELDS_HMR_EVENT,
} from './fieldsHmrContract.js'
import {ISLAND_RUNTIME_MODULE} from './islandRuntime.js'

const CONFIGS_DIR_NAME = 'configs'

/**
 * The config to generate a module for.
 * @internal
 */
export interface ConfigArtifact {
  fields: {name: string; public?: boolean; src: string; title: string}[]
}

/** Build-time capabilities that gate optional config artifacts. */
export interface ConfigArtifactOptions {
  /**
   * Whether the app's installed `sanity` ships the island-mount runtime
   * ({@link ISLAND_RUNTIME_MODULE}). Gates the `./island-runtime` expose —
   * emitting it against an older `sanity` would fail the build on an
   * unresolvable import.
   */
  islandRuntime?: boolean
}

/**
 * Expand the config into its federation modules: one aggregating all fields
 * (so the host imports one live config value), plus — when the installed
 * `sanity` ships it — the island-mount runtime the host uses to render custom
 * field inputs in isolated React roots.
 */
export function configArtifacts(
  config: ConfigArtifact | undefined,
  options: ConfigArtifactOptions = {},
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
            expose: './island-runtime',
            path: `${CONFIGS_DIR_NAME}/island_runtime.js`,
            source: () => islandRuntimeSource(),
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
  config: ConfigArtifact
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
  // Root-relative suffixes to recognize the declared field modules in Vite's
  // update payloads, whose paths are server-root-relative URLs (or `/@fs/...`
  // absolute paths) — hence suffix matching on the declared src.
  const fieldModulePaths = JSON.stringify(
    config.fields.map((field) => field.src.replace(/^\.\//, '')),
  )
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

if (import.meta.hot) {
  // In dev the Media Library host loads this module into its own page through
  // Module Federation, which keeps returning the first evaluation — the host
  // cannot re-import its way to fresh code, and Vite's default self-accept
  // would apply updates no one can see. So edits reach the host over window
  // events instead (host and config-app modules share this window):
  //
  // 1. accept() hands the host the re-evaluated namespace — its only way to
  //    get updated field definitions in place.
  // 2. 'vite:afterUpdate' (public Vite client API) arms a safety net for
  //    every field-related update: unless the host confirms an in-page apply
  //    within ${FIELDS_HMR_ACK_MS}ms (it dispatches the ack event after applying), the page
  //    reloads so the stale first evaluation is discarded. This also covers
  //    edits that never reach accept() above — e.g. field components that
  //    self-accept through react-refresh.
  import.meta.hot.accept((mod) => {
    const detail = mod ?? null
    window.dispatchEvent(new CustomEvent('${MEDIA_LIBRARY_FIELDS_HMR_EVENT}', {detail}))
  })
  const fieldModulePaths = ${fieldModulePaths}
  const isFieldPath = (candidate) => {
    if (typeof candidate !== 'string') return false
    const cleanPath = candidate.split('?', 1)[0]
    if (cleanPath.includes('${INSTALLATION_CONFIG_TYPE}')) return true
    return fieldModulePaths.some((src) => cleanPath === src || cleanPath.endsWith('/' + src))
  }
  import.meta.hot.on('vite:afterUpdate', (payload) => {
    const updates = payload && Array.isArray(payload.updates) ? payload.updates : []
    if (!updates.some((update) => isFieldPath(update.path) || isFieldPath(update.acceptedPath))) {
      return
    }
    // Detail-less ping: tells the host an update happened even when no fresh
    // namespace flows through accept(); the host coalesces it with the accept
    // event and keeps the payload.
    window.dispatchEvent(new CustomEvent('${MEDIA_LIBRARY_FIELDS_HMR_EVENT}'))
    // Shared timer on window: rapid successive updates extend one pending
    // reload instead of stacking several.
    window.clearTimeout(window.__mlFieldsHmrReload)
    window.__mlFieldsHmrReload = window.setTimeout(() => window.location.reload(), ${FIELDS_HMR_ACK_MS})
    if (!window.__mlFieldsHmrAckBound) {
      window.__mlFieldsHmrAckBound = true
      window.addEventListener('${MEDIA_LIBRARY_FIELDS_HMR_ACK}', () => {
        window.clearTimeout(window.__mlFieldsHmrReload)
      })
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
function islandRuntimeSource(): string {
  return `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
export * from ${JSON.stringify(ISLAND_RUNTIME_MODULE)}
`
}
