import {styleText} from 'node:util'

import {padEnd} from 'lodash-es'

import {type ModuleVersionResult} from './types.js'

/**
 * Get the display name for a module.
 *
 * @internal
 */
export function getDisplayName(mod: ModuleVersionResult): string {
  return mod.isGlobal ? `${mod.name} (global)` : mod.name
}

/**
 * Get formatters for the package versions.
 *
 * @internal
 */
export function getFormatters(versions: ModuleVersionResult[]): {
  formatName: (name: string) => string
  nameLength: number
  versionLength: number
} {
  let nameLength = 0
  let versionLength = 0

  for (const mod of versions) {
    const displayName = getDisplayName(mod)
    nameLength = Math.max(nameLength, displayName.length)
    versionLength = Math.max(versionLength, (mod.installed || '<missing>').length)
  }

  const formatName = (name: string): string =>
    padEnd(name, nameLength + 1)
      .replace(
        /^@sanity\/(.*?)(\s|$)/,
        `${styleText('yellow', '@sanity/')}${styleText('cyan', '$1')}$2`,
      )
      .replace(/^sanity(\s|$)/, `${styleText('yellow', 'sanity')}$1`)

  return {formatName, nameLength, versionLength}
}
