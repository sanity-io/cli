import path from 'node:path'

import {getLocalPackageVersion, readPackageJson} from '@sanity/cli-core'
import {createRequester} from '@sanity/cli-core/request'
import {coerce, eq, prerelease, parse as semverParse} from 'semver'

import {getModuleUrl} from '../actions/build/getAutoUpdatesImportMap.js'

export interface CompareDependencyVersions {
  installed: string
  pkg: string
  remote: string
}

export interface UnresolvedPrerelease {
  pkg: string
  version: string
}

/**
 * A package whose runtime version Module Server did not report, because of a network error,
 * a timeout or a 5xx.
 */
export interface UnavailableDependencyVersion {
  pkg: string
  reason: string
}

export interface CompareDependencyVersionsResult {
  mismatched: Array<CompareDependencyVersions>
  unresolvedPrerelease: Array<UnresolvedPrerelease>

  unavailable?: Array<UnavailableDependencyVersion>
}

const REMOTE_VERSION_TIMEOUT_MS = 5000

const defaultRequester = createRequester({
  httpErrors: false,
  timeout: REMOTE_VERSION_TIMEOUT_MS,
})

interface CompareDependencyVersionsOptions {
  /** When provided, uses the app-specific module endpoint instead of the default endpoint. */
  appId?: string
}

type PackageComparison =
  | {mismatch: CompareDependencyVersions; type: 'mismatched'}
  | {prerelease: UnresolvedPrerelease; type: 'unresolvedPrerelease'}
  | {type: 'matched'}
  | {type: 'unavailable'; unavailable: UnavailableDependencyVersion}

type RemoteVersion =
  | {reason: string; type: 'unavailable'}
  | {type: 'found'; version: string}
  | {type: 'not-found'}

/**
 * @internal
 *
 * Compares the versions of dependencies in the studio or app with their remote versions.
 *
 * This function reads the package.json file in the provided working directory, and compares the versions of the dependencies
 * specified in the `autoUpdatesImports` parameter with their remote versions. If the versions do not match, the dependency is
 * added to a list of failed dependencies, which is returned by the function.
 *
 * The failed dependencies are anything that does not strictly match the remote version.
 * This means that if a version is lower or greater by even a patch it will be marked as failed.
 *
 * @param packages - An array of packages with their name and version to compare against remote.
 * @param workDir - The path to the working directory containing the package.json file.
 * @param options - Optional configuration for version comparison.
 *
 * @returns A promise that resolves to an object containing `mismatched` (packages whose local and remote versions differ),
 * `unresolvedPrerelease` (packages with prerelease versions that could not be resolved remotely) and `unavailable`
 * (packages Module Server did not answer for, because of a network error, a timeout or a 5xx).
 *
 * @throws Throws an error if a non-prerelease package is not found remotely, if Module Server answers with an unexpected
 * response, or if the local version of a package cannot be parsed.
 */
export async function compareDependencyVersions(
  packages: {name: string; version: string}[],
  workDir: string,
  {appId}: CompareDependencyVersionsOptions = {},
): Promise<CompareDependencyVersionsResult> {
  const manifest = await readPackageJson(path.join(workDir, 'package.json'), {
    skipSchemaValidation: true,
  })
  const dependencies = {...manifest?.dependencies, ...manifest?.devDependencies}

  const comparisons = await Promise.all(
    packages
      .filter((pkg) => Boolean(dependencies[pkg.name]))
      .map((pkg) => comparePackageVersion(pkg, dependencies[pkg.name], {appId, workDir})),
  )

  return {
    mismatched: comparisons.flatMap((result) =>
      result.type === 'mismatched' ? [result.mismatch] : [],
    ),
    unavailable: comparisons.flatMap((result) =>
      result.type === 'unavailable' ? [result.unavailable] : [],
    ),
    unresolvedPrerelease: comparisons.flatMap((result) =>
      result.type === 'unresolvedPrerelease' ? [result.prerelease] : [],
    ),
  }
}

/**
 * @internal
 */
export function getUnavailableVersionsWarning(unavailable: UnavailableDependencyVersion[]): string {
  return (
    `Could not check the runtime version of ${unavailable.map((entry) => entry.pkg).join(', ')}: ` +
    `the Sanity module CDN did not respond. Continuing without the check.`
  )
}

async function comparePackageVersion(
  pkg: {name: string; version: string},
  manifestVersion: string,
  {appId, workDir}: {appId?: string; workDir: string},
): Promise<PackageComparison> {
  const remote = await getRemoteResolvedVersion(getModuleUrl(pkg, {appId}))

  if (remote.type !== 'found') {
    if (prerelease(pkg.version)) {
      return {prerelease: {pkg: pkg.name, version: pkg.version}, type: 'unresolvedPrerelease'}
    }
    if (remote.type === 'unavailable') {
      return {type: 'unavailable', unavailable: {pkg: pkg.name, reason: remote.reason}}
    }
    throw new Error(
      `Failed to resolve remote version for ${pkg.name}@${pkg.version}: package not found`,
    )
  }

  const packageVersion = await getLocalPackageVersion(pkg.name, workDir)

  const installed = coerce(packageVersion ? semverParse(packageVersion) : coerce(manifestVersion))

  if (!installed) {
    throw new Error(`Failed to parse installed version for ${pkg.name}`)
  }

  return eq(remote.version, installed.version)
    ? {type: 'matched'}
    : {
        mismatch: {installed: installed.version, pkg: pkg.name, remote: remote.version},
        type: 'mismatched',
      }
}

async function getRemoteResolvedVersion(url: string): Promise<RemoteVersion> {
  let response
  try {
    response = await defaultRequester({
      method: 'HEAD',
      redirect: 'manual',
      url,
    })
  } catch (err) {
    return {reason: err instanceof Error ? err.message : String(err), type: 'unavailable'}
  }

  // 302 is expected, but lets also handle 2xx
  if (response.status < 400) {
    const resolved = response.headers.get('x-resolved-version')
    if (!resolved) {
      throw new Error(`Missing 'x-resolved-version' header on response from HEAD ${url}`)
    }
    return {type: 'found', version: resolved}
  }

  if (response.status === 404) {
    return {type: 'not-found'}
  }

  if (response.status === 429 || response.status >= 500) {
    return {reason: `HTTP ${response.status} ${response.statusText}`, type: 'unavailable'}
  }

  throw new Error(`Unexpected HTTP response: ${response.status} ${response.statusText}`)
}
