import {isStaging} from '@sanity/cli-core/util'

const PRODUCTION_API_HOST = 'https://api.sanity.io'
const STAGING_API_HOST = 'https://api.sanity.work'

// Mirrors the validation `@sanity/client` applies before building a project hostname.
const PROJECT_ID_PATTERN = /^[-a-z0-9]+$/i

/**
 * The `api` section of the CLI config. `apiHost` isn't part of the typed config,
 * so it is only used when present and a string.
 */
interface CliApiConfig {
  apiHost?: unknown
  projectId?: unknown
}

/**
 * The origin the Studio sends its project API requests (including `/users/me`)
 * to, mirroring how `@sanity/client` builds the project hostname. Returns
 * `undefined` when there is no usable project ID, so no hints are emitted.
 *
 * @internal
 */
export function getApiPreconnectOrigin(api?: CliApiConfig): string | undefined {
  const {apiHost, projectId} = api ?? {}
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) return undefined

  try {
    const defaultHost = isStaging() ? STAGING_API_HOST : PRODUCTION_API_HOST
    const url = new URL(typeof apiHost === 'string' && apiHost ? apiHost : defaultHost)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined

    url.hostname = `${projectId}.${url.hostname}`
    return url.origin
  } catch {
    return undefined
  }
}
