import {type ModuleFederationOptions} from '@module-federation/vite'
import {valid as validSemver} from 'semver'

interface SharedDependency {
  // Package name used for import matching and in the share scope.
  name: string

  // Optional packages do not disable sharing when an app does not use them.
  optional?: boolean
  // `false` checks compatibility without publishing the package as a provider.
  share?: false
}

// Add approved packages here; every version contributes to the compatibility scope.
const sharedDependencies: readonly SharedDependency[] = [
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

type SharedEntries = Exclude<ModuleFederationOptions['shared'], string[] | undefined>

export interface FederationSharing extends Pick<
  ModuleFederationOptions,
  'shareScope' | 'shareStrategy'
> {
  shared: SharedEntries
}

export function findSharedDependencyName(specifier: string): string | undefined {
  return sharedDependencies.find(({name}) => specifier === name || specifier.startsWith(`${name}/`))
    ?.name
}

export function createFederationSharing(
  dependencies: ResolvedDependency[],
): FederationSharing | undefined {
  const versions = resolveCompatibleVersions(dependencies)
  if (!versions) return undefined

  // The scope includes every exact version so only apps with the same dependency set can share.
  const shareScope =
    'sanity-' + sharedDependencies.map(({name}) => `${name}-${versions.get(name)}`).join('-')
  return {
    shared: createSharedEntries(dependencies, shareScope),
    shareScope,
    // Prefer a compatible provider that another app already loaded before downloading a local copy.
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
  // pnpm patch hashes identify different package code under the same version, so patched copies stay local.
  if (root.includes('patch_hash=')) return undefined
  // Semver ignores build metadata, so only its unchanged canonical form is safe to share.
  if (validSemver(version) !== version) return undefined
  return version
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
      // @module-federation/vite defaults providers to "default" unless each entry repeats this scope.
      shareScope,
      singleton: false,
      strictVersion: true,
      version,
    }
  }
  // Vite resolves imports concurrently, so sort providers to keep generated chunks reproducible.
  return Object.fromEntries(
    Object.entries(entries).toSorted(([left], [right]) => left.localeCompare(right)),
  )
}
