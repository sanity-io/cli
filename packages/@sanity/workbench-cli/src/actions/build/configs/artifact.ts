import {
  INSTALLATION_CONFIG_TYPE,
  MEDIA_LIBRARY_INSTALLATION_CONFIG_CONTRACT_VERSION,
} from '../../../contract.js'
import {type GeneratedArtifact} from '../artifact.js'

const CONFIGS_DIR_NAME = 'configs'

/**
 * The installation config to generate a module for.
 * @internal
 */
export interface ConfigArtifact {
  fields: {name: string; public?: boolean; src: string; title: string}[]
}

/** Expand the installation config into one federation module aggregating all fields, so the host imports one live config value. */
export function installationConfigArtifacts(
  config: ConfigArtifact | undefined,
): GeneratedArtifact[] {
  if (!config) return []
  return [
    {
      expose: `./${CONFIGS_DIR_NAME}/${INSTALLATION_CONFIG_TYPE}`,
      path: `${CONFIGS_DIR_NAME}/${INSTALLATION_CONFIG_TYPE}.js`,
      source: ({resolveImport}) => mediaLibraryInstallationConfigSource({config, resolveImport}),
    },
  ]
}

/**
 * Emits `export const config`: each field's serializable `{name, title, public}`
 * plus its live `defineField` value, the one thing the wire can't carry.
 * `appType` stays off the module — the host assigns it from the wire record.
 */
function mediaLibraryInstallationConfigSource(input: {
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
export const version = ${MEDIA_LIBRARY_INSTALLATION_CONFIG_CONTRACT_VERSION}
export const config = {
  fields: [
${entries}
  ],
}

if (import.meta.hot) {
  // A config is data, not a rendered island with a live root to remount —
  // self-accept so a field edit swaps the module in place; the host re-reads it.
  import.meta.hot.accept()
}
`
}
