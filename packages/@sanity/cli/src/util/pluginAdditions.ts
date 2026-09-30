import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

/**
 * Packaged plugins live in a private dependency tree. Oclif resolves additional
 * plugins relative to this manifest without adding npm installation edges.
 * Workspace builds continue to use the root package's declared dependencies.
 */
export function getPluginAdditions(manifest = new URL('../package.json', import.meta.url)) {
  if (!existsSync(manifest)) return {}

  return {
    pluginAdditions: {
      core: ['@oclif/plugin-help', '@sanity/runtime-cli', '@sanity/workflow-cli'],
      path: fileURLToPath(new URL('.', manifest)),
    },
  }
}
