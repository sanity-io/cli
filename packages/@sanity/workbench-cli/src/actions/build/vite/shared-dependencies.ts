import path from 'node:path'

import {type ModuleFederationOptions} from '@module-federation/vite'
import {valid as validSemver} from 'semver'

interface SharedDependency {
  name: string

  // `false` means the version must match, but the package is not shared.
  share?: false
}

// If any of these can't be shared, nothing is shared.
const reactDependencies: readonly SharedDependency[] = [
  {name: 'react'},
  {name: 'react-dom'},
  // react-dom keeps its task queue in scheduler, so scheduler is bundled with react-dom.
  {name: 'scheduler', share: false},
]

// If one of these can't be shared, only that package stays in the app bundle.
// List a package after the packages from this list it has as peer dependencies.
const optionalDependencies: readonly SharedDependency[] = [
  {name: 'styled-components'},
  {name: '@sanity/ui'},
  // @sanity/sdk keeps module-level stores and stays in each app. These dependencies of it keep no state.
  {name: '@sanity/client'},
  {name: 'groq-js'},
]

const sharedDependencies = [...reactDependencies, ...optionalDependencies]

// Vite adds these aliases for its own client modules. They never match a shared package.
const viteInternalAliases = new Set([/^\/?@vite\/client/.source, /^\/?@vite\/env/.source])

export interface ResolvedDependency {
  name: string
  root: string
  version: string

  // Set when the project root can't resolve the package. Module Federation's own lookup would follow
  // pnpm's NODE_PATH, which Rolldown ignores, and emit an import that fails to build.
  import?: string
  peerDependencies?: Record<string, string>
  // Set when the fallback provider can import the package, from the project root or from `import`.
  specifier?: string
}

type SharedEntries = Exclude<ModuleFederationOptions['shared'], string[] | undefined>
type SharedEntry = Extract<SharedEntries[string], object> & {import?: string; shareScope: string}

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

  // Share scopes only serve JavaScript modules. Files like `@sanity/ui/styles.css` stay in the app.
  return specifier !== entry.name && path.extname(specifier) ? undefined : entry.name
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

  // Only a literal prefix like /^@app\// is known to be safe. Any other regex might match a shared import.
  const namespace = find.source.match(/^\^([@\w-]+)\\\/$/u)?.[1]
  if (!namespace) return true
  return sharedDependencies.some(({name}) => name === namespace || name.startsWith(`${namespace}/`))
}

export function createFederationSharing(
  dependencies: ResolvedDependency[],
): FederationSharing | {disabledReason: string} {
  const shareScopes = assignShareScopes(dependencies)
  if ('disabledReason' in shareScopes) return shareScopes

  const shared = createSharedEntries(dependencies, shareScopes)
  return {
    shared,
    // Module Federation uses the first share scope as the container default.
    shareScope: [...new Set([shared.react, ...Object.values(shared)].map((e) => e.shareScope))],
    // Use a copy that another app already loaded before downloading this app's copy.
    shareStrategy: 'loaded-first',
  }
}

// Returns the share scope for every shared package. Apps only exchange a package when they use the
// same share scope, so the name contains the exact versions that must match:
// - React share scope: the react, react-dom and scheduler versions
// - Optional package: the React share scope plus the version of each shared peer dependency
function assignShareScopes(
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
  // Sharing react-dom while the app bundles its own react would give the app two Reacts.
  if (!dependencies.some(({name, specifier}) => name === 'react' && specifier === 'react')) {
    return {disabledReason: 'The react import could not be resolved to a shared provider'}
  }
  if (versions.get('react') !== versions.get('react-dom')) {
    return {
      disabledReason: `React (${versions.get('react')}) and React DOM (${versions.get('react-dom')}) versions differ`,
    }
  }

  const reactShareScope = `sanity-${reactDependencies.map(({name}) => `${name}-${versions.get(name)}`).join('-')}`
  const shareScopes = new Map<string, string>()
  for (const {name, share} of reactDependencies) {
    if (share !== false) shareScopes.set(name, reactShareScope)
  }

  for (const {name} of optionalDependencies) {
    const copies = copiesOf(name)
    if (findUnshareableReason(name, copies)) continue

    // The app that loads a shared package also supplies its peer dependencies. When a peer
    // dependency stays in each app's bundle, the package can't be shared either.
    const peerDependencies = optionalDependencies
      .map((dependency) => dependency.name)
      .filter((peer) => peer in (copies[0].peerDependencies ?? {}))
    if (peerDependencies.some((peer) => !shareScopes.has(peer))) continue

    versions.set(name, copies[0].version)
    const peerVersions = peerDependencies.map((peer) => `-${peer}-${versions.get(peer)}`)
    shareScopes.set(name, reactShareScope + peerVersions.join(''))
  }
  return shareScopes
}

function findUnshareableReason(name: string, copies: ResolvedDependency[]): string | undefined {
  if (copies.length === 0) return `No installed copy of ${name} was found`

  const {root, version} = copies[0]
  if (copies.some((copy) => copy.root !== root || copy.version !== version)) {
    return `Multiple installed copies of ${name} were found`
  }
  // A pnpm patch changes the code without changing the version.
  if (root.includes('patch_hash=')) return `${name} has a local pnpm patch`
  // Semver ignores build metadata (`1.0.0+local`), so two different builds would look compatible.
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
  for (const {import: file, name, specifier, version} of dependencies) {
    const shareScope = shareScopes.get(name)
    if (!specifier || !shareScope) continue

    entries[specifier] = {
      eager: false,
      import: file,
      requiredVersion: version,
      // Without a share scope on the entry, @module-federation/vite puts the provider in "default".
      shareScope,
      singleton: false,
      strictVersion: true,
      version,
    }
  }
  // Vite resolves imports in parallel. Sorting keeps the generated chunks the same across builds.
  return Object.fromEntries(
    Object.entries(entries).toSorted(([left], [right]) => left.localeCompare(right)),
  )
}
