import {type ModuleFederationOptions} from '@module-federation/vite'
import {valid as validSemver} from 'semver'

interface SharedDependency {
  // Package name used for import matching and in the share scope.
  name: string

  // Optional packages do not disable sharing when an app does not use them.
  optional?: boolean
  // `false` selects this package's exact version without splitting the React compatibility group.
  scope?: false
  // `false` checks compatibility without publishing the package as a provider.
  share?: false
}

// Add approved packages here; versions contribute to the scope unless explicitly excluded.
const sharedDependencies: readonly SharedDependency[] = [
  {name: 'react'},
  {name: 'react-dom'},
  // React DOM owns scheduler's mutable queue, so only its version joins the scope.
  {name: 'scheduler', share: false},
  {name: 'styled-components', optional: true, scope: false},
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

  // React and its renderer must agree; styled-components selects its own exact version in this pool.
  const shareScope =
    'sanity-' +
    sharedDependencies
      .filter(({scope}) => scope !== false)
      .map(({name}) => `${name}-${versions.get(name)}`)
      .join('-')
  return {
    shared: createSharedEntries(dependencies, shareScope),
    // The array form makes Module Federation use named pools instead of the host's default pool.
    shareScope: [shareScope],
    // Prefer a compatible provider that another app already loaded before downloading a local copy.
    shareStrategy: 'loaded-first',
  }
}

export function aliasMayRewriteSharedImport(find: RegExp | string): boolean {
  if (typeof find === 'string') {
    return (
      Boolean(findSharedDependencyName(find)) ||
      sharedDependencies.some(({name}) => name.startsWith(`${find}/`))
    )
  }

  // Only an anchored, literal namespace proves that a regex cannot intercept a shared subpath.
  // Alternation or an optional slash could also match imports outside that namespace.
  const namespace = find.source.match(/^\^(?:\\\/\?)?([@\w-]+)(?:\\\/|\/)(?![?*{])/u)?.[1]
  if (!namespace || find.source.includes('|') || find.ignoreCase || find.multiline) return true
  return sharedDependencies.some(({name}) => name === namespace || name.startsWith(`${namespace}/`))
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
