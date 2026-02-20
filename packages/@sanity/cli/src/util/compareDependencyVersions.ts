import path from 'node:path'

import {readPackageJson} from '@sanity/cli-core'
import {createRequester} from '@sanity/cli-core/request'
import semver from 'semver'

import {getModuleUrl} from '../actions/build/getAutoUpdatesImportMap.js'
import {getLocalPackageVersion} from './getLocalPackageVersion.js'

const defaultRequester = createRequester({
  middleware: {httpErrors: false, promise: {onlyBody: false}},
})

interface CompareDependencyVersions {
  installed: string
  pkg: string
  remote: string
}

interface CompareDependencyVersionsOptions {
  /** When provided, uses the app-specific module endpoint instead of the default endpoint. */
  appId?: string
  /** Optional requester for dependency injection (primarily for testing). */
  requester?: typeof defaultRequester
}

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
 * @returns A promise that resolves to an array of objects, each containing
 * the name of a package whose local and remote versions do not match, along with the local and remote versions.
 *
 * @throws Throws an error if the remote version of a package cannot be fetched, or if the local version of a package
 * cannot be parsed.
 */
export async function compareDependencyVersions(
  packages: {name: string; version: string}[],
  workDir: string,
  {appId, requester = defaultRequester}: CompareDependencyVersionsOptions = {},
): Promise<Array<CompareDependencyVersions>> {
  const manifest = await readPackageJson(path.join(workDir, 'package.json'), {
    skipSchemaValidation: true,
  })
  const dependencies = {...manifest?.dependencies, ...manifest?.devDependencies}

  const failedDependencies: Array<CompareDependencyVersions> = []

  for (const pkg of packages) {
    const resolvedVersion = await getRemoteResolvedVersion(getModuleUrl(pkg, {appId}), requester)

    const packageVersion = await getLocalPackageVersion(pkg.name, workDir)

    const manifestVersion = dependencies[pkg.name]

    const installed = semver.coerce(
      packageVersion ? semver.parse(packageVersion) : semver.coerce(manifestVersion),
    )

    if (!installed) {
      throw new Error(`Failed to parse installed version for ${pkg.name}`)
    }

    if (!semver.eq(resolvedVersion, installed.version)) {
      failedDependencies.push({
        installed: installed.version,
        pkg: pkg.name,
        remote: resolvedVersion,
      })
    }
  }

  return failedDependencies
}

async function getRemoteResolvedVersion(
  url: string,
  request: typeof defaultRequester,
): Promise<string> {
  let response
  try {
    response = await request({
      maxRedirects: 0,
      method: 'HEAD',
      url,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to fetch remote version for ${url}: ${message}`)
  }

  // 302 is expected, but lets also handle 2xx
  if (response.statusCode < 400) {
    const resolved = response.headers['x-resolved-version']
    if (!resolved) {
      throw new Error(`Missing 'x-resolved-version' header on response from HEAD ${url}`)
    }
    return resolved
  }

  throw new Error(`Unexpected HTTP response: ${response.statusCode} ${response.statusMessage}`)
}
