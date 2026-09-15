import {type ModuleFederationOptions} from '@module-federation/vite'

interface SharedDependency {
  name: string
  scopeKey: string

  required?: boolean
  requireRootImport?: boolean
  sameVersionAs?: string
  share?: boolean
}

// Every entry joins the compatibility tuple; only consumed public imports become providers.
export const sharedDependencies: readonly SharedDependency[] = [
  {name: 'react', required: true, requireRootImport: true, scopeKey: 'react', share: true},
  {name: 'react-dom', required: true, sameVersionAs: 'react', scopeKey: 'dom', share: true},
  // React DOM owns scheduler's mutable queue; its version matters, but its module stays local.
  {name: 'scheduler', required: true, scopeKey: 'scheduler'},
  {name: 'styled-components', scopeKey: 'styled', share: true},
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

export function createFederationSharing(
  dependencies: ResolvedDependency[],
): FederationSharing | undefined {
  const versions = new Map<string, string>()
  for (const {name, required, requireRootImport} of sharedDependencies) {
    const copies = dependencies.filter((dependency) => dependency.name === name)
    // Sharing a renderer without its React import would split hook and context identity.
    if (requireRootImport && !copies.some(({specifier}) => specifier === name)) return undefined
    if (new Set(copies.map(({root}) => root)).size > 1) return undefined
    // A local patch can change behavior without changing package.json's version.
    if (copies.some(({root}) => root.includes('patch_hash='))) return undefined
    if (copies.length === 0) {
      if (required) return undefined
      versions.set(name, 'none')
      continue
    }
    const {version} = copies[0]
    if (!/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(version)) return undefined
    if (copies.some((copy) => copy.version !== version)) return undefined
    versions.set(name, version)
  }
  for (const {name, sameVersionAs} of sharedDependencies) {
    if (sameVersionAs && versions.get(name) !== versions.get(sameVersionAs)) return undefined
  }

  const shareScope =
    'sanity-' +
    sharedDependencies.map(({name, scopeKey}) => `${scopeKey}-${versions.get(name)}`).join('-')
  const shared: Exclude<ModuleFederationOptions['shared'], string[] | undefined> = {}
  const entries = dependencies.toSorted((a, b) =>
    (a.specifier ?? '').localeCompare(b.specifier ?? ''),
  )
  for (const {name, specifier, version} of entries) {
    if (
      !specifier ||
      !sharedDependencies.some((dependency) => dependency.name === name && dependency.share)
    )
      continue
    shared[specifier] = {
      eager: false,
      requiredVersion: version,
      // Vite 1.21 normalizes each entry's missing scope to "default".
      shareScope,
      singleton: false,
      strictVersion: true,
      version,
    }
  }
  if (Object.keys(shared).length === 0) return undefined
  return {shared, shareScope, shareStrategy: 'loaded-first'}
}
