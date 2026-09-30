import {subdebug} from '@sanity/cli-core'
import {getLatestVersion, type Options} from 'get-latest-version'

const debug = subdebug('updateChecker')

interface RegistryRequest {
  headers: Record<string, string>
  url: string
}

interface RegistryResponse {
  body: unknown
}

type Request = (options: RegistryRequest) => Promise<RegistryResponse>

/** `https://registry/@scope%2Fname` → `https://registry/-/package/@scope%2Fname/dist-tags` */
export function distTagsUrl(packageUrl: string): string {
  const url = new URL(packageUrl)
  url.pathname = url.pathname.replace(/([^/]+)$/, '-/package/$1/dist-tags')
  return url.href
}

/**
 * Latest published version of a package. Reads the registry's dist-tags, a
 * few kilobytes, rather than the package document with every version, which
 * is over a megabyte for the Sanity packages. Registries without the
 * dist-tags endpoint get the package document.
 */
export async function fetchLatestVersion(packageName: string): Promise<string | undefined> {
  // Keeps the package's registry, authentication, retries and proxy handling.
  const request = (getLatestVersion as unknown as {request: Request}).request
  const distTags: Request = async (options) => {
    const response = await request({...options, url: distTagsUrl(options.url)})
    return {...response, body: {'dist-tags': response.body, versions: {}}}
  }
  try {
    const latest = await getLatestVersion(packageName, {request: distTags} as Options)
    if (latest) return latest
  } catch (err) {
    debug('Dist-tags lookup failed for %s, reading package document: %s', packageName, err)
  }
  return getLatestVersion(packageName)
}
