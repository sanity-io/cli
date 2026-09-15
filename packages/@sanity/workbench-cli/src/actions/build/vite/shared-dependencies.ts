import {type ModuleFederationOptions} from '@module-federation/vite'
import {valid as validSemver} from 'semver'

interface SharedDependency {
  name: string

  optional?: boolean
  share?: false
}

// Add approved packages here; every version contributes to the compatibility scope.
export const sharedDependencies: readonly SharedDependency[] = [
  {name: 'react'},
  {name: 'react-dom'},
  // React DOM owns scheduler's mutable queue, so only its version joins the scope.
  {name: 'scheduler', share: false},
  {name: 'styled-components', optional: true},
]

export interface ResolvedDependency {
  name: string
  root: string
  version: string

  specifier?: string
}

export type FederationSharing = Pick<
  ModuleFederationOptions,
  'shared' | 'shareScope' | 'shareStrategy'
>

type SharedEntries = Exclude<ModuleFederationOptions['shared'], string[] | undefined>

export function createFederationSharing(
  dependencies: ResolvedDependency[],
): FederationSharing | undefined {
  const versions = resolveCompatibleVersions(dependencies)
  if (!versions) return undefined

  const shareScope = createShareScope(versions)
  return {
    shared: createSharedEntries(dependencies, shareScope),
    shareScope,
    shareStrategy: 'loaded-first',
  }
}

function resolveCompatibleVersions(
  dependencies: ResolvedDependency[],
): Map<string, string> | undefined {
  const versions = new Map<string, string>()
  for (const {name, optional} of sharedDependencies) {
    const copies = dependencies.filter((dependency) => dependency.name === name)
    if (copies.length === 0 && optional) {
      versions.set(name, 'none')
      continue
    }
    const version = getSingleInstalledVersion(copies)
    if (!version) return undefined
    versions.set(name, version)
  }

  // Sharing the renderer without its React import would split hook and context identity.
  if (!dependencies.some(({name, specifier}) => name === 'react' && specifier === 'react'))
    return undefined
  if (versions.get('react') !== versions.get('react-dom')) return undefined
  return versions
}

function getSingleInstalledVersion(copies: ResolvedDependency[]): string | undefined {
  if (copies.length === 0) return undefined
  const {root, version} = copies[0]
  if (copies.some((copy) => copy.root !== root || copy.version !== version)) return undefined
  // A local patch can change runtime internals without changing the package version.
  if (root.includes('patch_hash=')) return undefined
  // Semver ignores build metadata, so only its unchanged canonical form is safe to share.
  if (validSemver(version) !== version) return undefined
  return version
}

function createShareScope(versions: Map<string, string>): string {
  // A matching renderer or styled-components version is unsafe with a different React runtime.
  return 'sanity-' + sharedDependencies.map(({name}) => `${name}-${versions.get(name)}`).join('-')
}

function createSharedEntries(
  dependencies: ResolvedDependency[],
  shareScope: string,
): SharedEntries {
  const entries: SharedEntries = {}
  const providers = new Set(
    sharedDependencies.filter(({share}) => share !== false).map(({name}) => name),
  )
  for (const {name, specifier, version} of dependencies) {
    if (!specifier || !providers.has(name)) continue
    entries[specifier] = {
      eager: false,
      requiredVersion: version,
      // Vite 1.21 defaults each entry to "default", even when the container has another scope.
      shareScope,
      singleton: false,
      strictVersion: true,
      version,
    }
  }
  // Resolution finishes asynchronously; stable provider order keeps chunk hashes reproducible.
  return Object.fromEntries(
    Object.entries(entries).toSorted(([left], [right]) => left.localeCompare(right)),
  )
}
