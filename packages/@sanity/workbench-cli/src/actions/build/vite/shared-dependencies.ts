import path from 'node:path'

import {type ModuleFederationOptions} from '@module-federation/vite'
import {valid as validSemver} from 'semver'

interface SharedDependency {
  // Package name used for import matching and in the share scope.
  name: string

  // Optional packages do not disable sharing when an app does not use them.
  optional?: boolean
  // Share this package only alongside the named one, which has to be listed before it.
  requires?: string
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
  // A consumed @sanity/ui carries the provider's styled-components, and its ThemeProvider writes
  // the theme into that instance's context, where a local styled-components cannot read it.
  {name: '@sanity/ui', optional: true, requires: 'styled-components', scope: false},
]

// Vite injects these aliases for its own modules; neither can redirect a shared package import.
const viteInternalAliases = new Set([/^\/?@vite\/client/.source, /^\/?@vite\/env/.source])

export interface ResolvedDependency {
  name: string
  root: string
  version: string

  specifier?: string
}

type SharedEntries = Exclude<ModuleFederationOptions['shared'], string[] | undefined>
type SharedEntry = Extract<SharedEntries[string], object> & {shareScope: string}

export interface FederationSharing extends Pick<
  ModuleFederationOptions,
  'shareScope' | 'shareStrategy'
> {
  shared: Record<string, SharedEntry>
}

export function findSharedDependencyName(specifier: string): string | undefined {
  const entry = sharedDependencies.find(
    ({name}) => specifier === name || specifier.startsWith(`${name}/`),
  )
  if (!entry) return undefined
  // A subpath with a file extension (`@sanity/ui/styles.css`) is an asset the share scope cannot serve.
  return specifier !== entry.name && path.extname(specifier) ? undefined : entry.name
}

export function createFederationSharing(
  dependencies: ResolvedDependency[],
): FederationSharing | {disabledReason: string} {
  const versions = resolveCompatibleVersions(dependencies)
  if (!(versions instanceof Map)) return versions

  // React and its renderer must agree; styled-components and @sanity/ui select their own exact version in this share scope.
  const shareScope =
    'sanity-' +
    sharedDependencies
      .filter(({scope}) => scope !== false)
      .map(({name}) => `${name}-${versions.get(name)}`)
      .join('-')
  return {
    shared: createSharedEntries(dependencies, shareScope, versions),
    // The array form makes Module Federation use named shareScopes instead of the host's default share scope.
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

  if (find.ignoreCase || find.multiline) return true
  if (viteInternalAliases.has(find.source)) return false

  // Only accept a literal prefix like /^@app\//; more complex regexes may also match shared imports.
  const namespace = find.source.match(/^\^([@\w-]+)\\\/$/u)?.[1]
  if (!namespace) return true
  return sharedDependencies.some(({name}) => name === namespace || name.startsWith(`${namespace}/`))
}

function resolveCompatibleVersions(
  dependencies: ResolvedDependency[],
): Map<string, string> | {disabledReason: string} {
  const versions = new Map<string, string>()
  for (const {name, optional, requires, scope} of sharedDependencies) {
    const copies = dependencies.filter((dependency) => dependency.name === name)
    if (copies.length === 0) {
      if (optional) continue
      return {disabledReason: `No installed copy of ${name} was found`}
    }
    const unshareable =
      requires && !versions.has(requires)
        ? `${name} can only be shared alongside ${requires}`
        : findUnshareableReason(name, copies)
    if (unshareable) {
      // A package outside the scope name leaves the share scope on its own; one that defines it takes the share scope with it.
      if (scope === false) continue
      return {disabledReason: unshareable}
    }
    versions.set(name, copies[0].version)
  }

  // Sharing the renderer without its React import would split hook and context identity.
  if (!dependencies.some(({name, specifier}) => name === 'react' && specifier === 'react')) {
    return {disabledReason: 'The react import could not be resolved to a shared provider'}
  }
  if (versions.get('react') !== versions.get('react-dom')) {
    return {
      disabledReason: `React (${versions.get('react')}) and React DOM (${versions.get('react-dom')}) versions differ`,
    }
  }
  return versions
}

function findUnshareableReason(name: string, copies: ResolvedDependency[]): string | undefined {
  const {root, version} = copies[0]
  if (copies.some((copy) => copy.root !== root || copy.version !== version)) {
    return `Multiple installed copies of ${name} were found`
  }
  // pnpm patch hashes identify different package code under the same version, so patched copies stay local.
  if (root.includes('patch_hash=')) return `${name} has a local pnpm patch`
  // Semver ignores build metadata, so only its unchanged canonical form is safe to share.
  if (validSemver(version) !== version) {
    return `${name} has an unsupported version: ${JSON.stringify(version)}`
  }
  return undefined
}

function createSharedEntries(
  dependencies: ResolvedDependency[],
  shareScope: string,
  versions: Map<string, string>,
): Record<string, SharedEntry> {
  const entries: Record<string, SharedEntry> = {}
  const providers = new Set(
    sharedDependencies
      .filter(({name, share}) => share !== false && versions.has(name))
      .map(({name}) => name),
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
