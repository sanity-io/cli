import {INSTALLATION_CONFIG_TYPE, MEDIA_LIBRARY_CONFIG_CONTRACT_VERSION} from '../../../contract.js'
import {type GeneratedArtifact} from '../artifact.js'
import {MEDIA_LIBRARY_FIELDS_HMR_EVENT} from '../vite/plugins/plugin-media-library-fields-hmr.js'
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
  // The Media Library host loads this module once through Module Federation
  // and never re-reads it, so a bare self-accept would leave field edits
  // invisible until a manual refresh. Forward the fresh namespace to the host
  // on this window (Workbench federation, or the host's Dashboard iframe) —
  // the host ACKs an in-page apply; without an ACK the dev client falls back
  // to a full reload (see the media-library-fields-hmr plugin).
  import.meta.hot.accept((mod) => {
    const detail = mod ?? null
    window.dispatchEvent(new CustomEvent('${MEDIA_LIBRARY_FIELDS_HMR_EVENT}', {detail}))
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
