import path from 'node:path'

import {type ModuleFederationOptions} from '@module-federation/vite'
import {valid as validSemver} from 'semver'

interface SharedDependency {
  // Package name used for import matching and in share scope names.
  name: string

  // Consumers only take this package from an app sharing the same version of the named package,
  // which has to be listed before it.
  pinnedTo?: string
  // `false` checks compatibility without publishing the package as a provider.
  share?: false
}

// React and its renderer must agree, so every share scope is named after these exact versions and a
// problem with any of them keeps all dependencies local.
const reactDependencies: readonly SharedDependency[] = [
  {name: 'react'},
  {name: 'react-dom'},
  // React DOM owns scheduler's mutable queue, so only its version joins the share scope name.
  {name: 'scheduler', share: false},
]

// Each of these is shared at its exact version when it can be, and otherwise stays local alone.
const optionalDependencies: readonly SharedDependency[] = [
  {name: 'styled-components'},
  // @sanity/ui's ThemeProvider writes the theme into its own styled-components' context, where
  // an app's `styled` components only read it when both come from the same copy.
  {name: '@sanity/ui', pinnedTo: 'styled-components'},
]

const sharedDependencies = [...reactDependencies, ...optionalDependencies]

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

  const reactShareScope = `sanity-${reactDependencies.map(({name}) => `${name}-${versions.get(name)}`).join('-')}`
  const shareScopes = new Map<string, string>()
  for (const {name, pinnedTo, share} of sharedDependencies) {
    if (share === false || !versions.has(name)) continue
    shareScopes.set(name, pinnedTo ? `${reactShareScope}-${pinnedTo}-${versions.get(pinnedTo)}` : reactShareScope)
  }
  const shared = createSharedEntries(dependencies, shareScopes)
  return {
    shared,
    // The array form makes Module Federation use named shareScopes instead of the host's default share scope.
    shareScope: [
      ...new Set([reactShareScope, ...Object.values(shared).map(({shareScope}) => shareScope)]),
    ],
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
  const copiesOf = (name: string) => dependencies.filter((dependency) => dependency.name === name)
  const versions = new Map<string, string>()
  for (const {name} of reactDependencies) {
    const copies = copiesOf(name)
    const disabledReason = findUnshareableReason(name, copies)
    if (disabledReason) return {disabledReason}
    versions.set(name, copies[0].version)
  }
  for (const {name, pinnedTo} of optionalDependencies) {
    const copies = copiesOf(name)
    if (pinnedTo && !versions.has(pinnedTo)) continue
    if (!findUnshareableReason(name, copies)) versions.set(name, copies[0].version)
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
  if (copies.length === 0) return `No installed copy of ${name} was found`
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
  shareScopes: Map<string, string>,
): Record<string, SharedEntry> {
  const entries: Record<string, SharedEntry> = {}
  for (const {name, specifier, version} of dependencies) {
    const shareScope = shareScopes.get(name)
    if (!specifier || !shareScope) continue
    entries[specifier] = {
      eager: false,
      requiredVersion: version,
      // @module-federation/vite defaults providers to "default" unless each entry names its share scope.
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
