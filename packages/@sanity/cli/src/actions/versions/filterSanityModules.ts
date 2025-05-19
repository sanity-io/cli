import {type PackageJson} from '../../util/readPackageJson.js'

/**
 * Filter the sanity modules from the package.json.
 *
 * @param manifest - The package.json manifest.
 * @returns The filtered sanity modules.
 */
export function filterSanityModules(manifest: Partial<PackageJson>): Record<string, string> {
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  }

  const filteredDependencies: Record<string, string> = {}

  for (const mod in dependencies) {
    if (mod.startsWith('@sanity/') || mod === 'sanity') {
      filteredDependencies[mod] = dependencies[mod]
    }
  }

  return filteredDependencies
}
