import path from 'node:path'

import {type PackageJson} from '@sanity/cli-core'

/** Conditions a browser bundler would apply when resolving package exports. */
const BROWSER_BUNDLER_CONDITIONS = ['browser', 'import', 'default'] as const

type ExportValue = string | {[condition: string]: ExportValue} | null

export type VendorEntryPoints = Record<string, string>

/**
 * Resolves a conditional `exports` value for a browser bundler.
 *
 * Walks `browser` → `import` → `default`, matching the order bundlers use for
 * browser-targeted builds.
 */
export function resolveExportTarget(
  value: ExportValue,
  conditions: readonly string[] = BROWSER_BUNDLER_CONDITIONS,
): string {
  if (typeof value === 'string') {
    return value
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Invalid package export target')
  }

  for (const condition of conditions) {
    if (condition in value) {
      return resolveExportTarget(value[condition]!, conditions)
    }
  }

  throw new Error(
    `Could not resolve package export target (missing conditions: ${conditions.join(', ')})`,
  )
}

/**
 * Lists export subpaths declared in a package's `exports` field.
 *
 * Pattern exports (keys containing `*`) are omitted because their concrete
 * entry points cannot be enumerated ahead of time.
 */
export function listExportSubpaths(exportsField: NonNullable<PackageJson['exports']>): string[] {
  return Object.keys(exportsField).filter((subpath) => !subpath.includes('*'))
}

/**
 * Resolves browser-targeted entry points from a package's `exports` field.
 */
export function resolveExportsEntryPoints(
  exportsField: NonNullable<PackageJson['exports']>,
): VendorEntryPoints {
  const entryPoints: VendorEntryPoints = {}

  for (const subpath of listExportSubpaths(exportsField)) {
    entryPoints[subpath] = resolveExportTarget(exportsField[subpath] as ExportValue)
  }

  return entryPoints
}

/**
 * Resolves entry points for packages that use the webpack-style top-level
 * `browser` field instead of `exports` (e.g. `styled-components`).
 *
 * Picks the ESM `module` entry when present, then applies any `browser` remap.
 */
interface BrowserFieldManifest extends PackageJson {
  browser?: Record<string, string> | string
  module?: string
}

export function resolveBrowserFieldEntryPoints(manifest: PackageJson): VendorEntryPoints {
  const {browser, main, module: moduleField} = manifest as BrowserFieldManifest
  const entryField = moduleField ?? main
  if (!entryField) {
    throw new Error(`Package '${manifest.name}' is missing 'module' and 'main' entry points`)
  }

  let entryPath = entryField

  if (browser && typeof browser === 'object') {
    const lookupKey = entryPath.startsWith('./') ? entryPath : `./${entryPath}`
    const remapped = browser[lookupKey]
    if (remapped) {
      entryPath = remapped
    }
  }

  return {
    '.': entryPath,
    './package.json': './package.json',
  }
}

export type VendorEntryPointStrategy = 'browser-field' | 'exports'

export interface ResolveVendorEntryPointsOptions {
  manifest: PackageJson
  packageDir: string

  /** How to resolve entry points when a package does not use `exports`. */
  fallback?: VendorEntryPointStrategy
}

/**
 * Resolves the vendor entry-point map for a package from its `package.json`.
 */
export function resolveVendorEntryPoints({
  fallback = 'exports',
  manifest,
}: ResolveVendorEntryPointsOptions): VendorEntryPoints {
  if (manifest.exports) {
    return resolveExportsEntryPoints(manifest.exports)
  }

  if (fallback === 'browser-field') {
    return resolveBrowserFieldEntryPoints(manifest)
  }

  throw new Error(
    `Package '${manifest.name}' does not declare an 'exports' field and no fallback strategy applies`,
  )
}

/**
 * Resolves the on-disk path for a package entry point.
 */
export function resolveEntryPointPath(packageDir: string, relativeEntryPoint: string): string {
  return path.join(packageDir, relativeEntryPoint)
}
