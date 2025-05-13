import {type PackageJson} from '../../util/readPackageJson.js'

/*
 * The `sanity upgrade` command should only be responsible for upgrading the
 * _studio_ related dependencies. Modules like @sanity/block-content-to-react
 * shouldn't be upgraded using the same tag/range as the other studio modules.
 *
 * We don't have a guaranteed list of the "studio modules", so instead we
 * explicitly exclude certain modules from being upgraded.
 */
const PACKAGES_TO_EXCLUDE = new Set([
  '@sanity/block-content-to-html',
  '@sanity/block-content-to-react',
  '@sanity/client',
])

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
      if (PACKAGES_TO_EXCLUDE.has(mod)) {
        continue
      }

      filteredDependencies[mod] = dependencies[mod]
    }
  }

  return filteredDependencies
}
