import {existsSync, readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'
const LOOKUP_TIMEOUT_MS = 30_000

type Npmrc = Record<string, string>

function parseNpmrc(file: string): Npmrc {
  const config: Npmrc = {}
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return config
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2')
      .replaceAll(/\$\{([^}]+)\}/g, (_, name: string) => process.env[name] ?? '')
    config[key] = value
  }
  return config
}

function findUp(file: string, from: string): string | undefined {
  let dir = from
  while (true) {
    const candidate = join(dir, file)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function normalize(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

/**
 * Registry and auth for a package, resolved like `registry-url` and
 * `registry-auth-token`: npm's environment, the nearest project `.npmrc`, then
 * the user's `.npmrc`.
 */
export function registryFor(
  pkgName: string,
  cwd = process.cwd(),
): {authorization?: string; url: string} {
  const projectRc = findUp('.npmrc', cwd)
  const userRc =
    process.env.npm_config_userconfig ||
    process.env.NPM_CONFIG_USERCONFIG ||
    join(homedir(), '.npmrc')
  const config: Npmrc = {...parseNpmrc(userRc), ...(projectRc ? parseNpmrc(projectRc) : {})}
  const scope = pkgName.startsWith('@') ? pkgName.split('/')[0] : undefined
  const envRegistry = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY
  const url = normalize(
    (scope && config[`${scope}:registry`]) || envRegistry || config.registry || DEFAULT_REGISTRY,
  )

  // Most specific `//host/path/:_authToken` match wins
  const parsed = new URL(url)
  let path = `//${parsed.host}${parsed.pathname}`
  while (path.length > 2) {
    const token = config[`${path}:_authToken`]
    if (token) return {authorization: `Bearer ${token}`, url}
    const auth = config[`${path}:_auth`]
    if (auth) return {authorization: `Basic ${auth}`, url}
    const next = path.replace(/[^/]*\/?$/, '')
    if (next === path) break
    path = next
  }
  return {url}
}

async function fetchLatest(pkgName: string, signal: AbortSignal): Promise<string | undefined> {
  const {authorization, url} = registryFor(pkgName)
  const pkgUrl = new URL(encodeURIComponent(pkgName).replace(/^%40/, '@'), url).href
  const headers: Record<string, string> = {
    accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
  }
  if (authorization) headers.authorization = authorization

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(pkgUrl, {headers, signal})
      if (response.status === 404) return undefined
      if (!response.ok) throw new Error(`Registry responded with ${response.status}`)
      const data = (await response.json()) as {'dist-tags'?: Record<string, string>}
      return data['dist-tags']?.latest
    } catch (error) {
      if (signal.aborted || attempt >= 2) throw error
    }
  }
}

/**
 * Resolve `latest` ranges to `^<version>`, keeping other ranges as they are.
 * A lookup that fails or stalls falls back to `latest`, so a slow registry
 * can't block initialization.
 */
export function resolveLatestVersions(
  pkgs: Record<string, string>,
): Promise<Record<string, string>> {
  return Promise.all(
    Object.entries(pkgs).map(async ([name, range]): Promise<[string, string]> => {
      if (range !== 'latest') return [name, range]
      const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
      try {
        const version = await fetchLatest(name, signal)
        return [name, version ? `^${version}` : 'latest']
      } catch {
        return [name, 'latest']
      }
    }),
  ).then(Object.fromEntries)
}
