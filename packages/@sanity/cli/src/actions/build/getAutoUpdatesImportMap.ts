const MODULES_HOST =
  process.env.SANITY_MODULES_HOST ||
  (process.env.SANITY_INTERNAL_ENV === 'staging'
    ? 'https://sanity-cdn.work'
    : 'https://sanity-cdn.com')

function currentUnixTime(): number {
  return Math.floor(Date.now() / 1000)
}

type Package = {name: string; version: string}
/**
 * @internal
 */
export function getAutoUpdatesImportMap<const Pkg extends Package>(
  packages: Pkg[],
  options: {appId?: string; baseUrl?: string; timestamp?: number} = {},
) {
  return Object.fromEntries(
    packages.flatMap((pkg) => getAppAutoUpdateImportMapForPackage(pkg, options)),
  ) as {[K in `${Pkg['name']}/` | Pkg['name']]: string}
}

/**
 * @internal
 */
function getAppAutoUpdateImportMapForPackage<const Pkg extends Package>(
  pkg: Pkg,
  options: {appId?: string; baseUrl?: string; timestamp?: number} = {},
): [[Pkg['name'], string], [`${Pkg['name']}/`, string]] {
  const moduleUrl = getModuleUrl(pkg, options)

  return [
    [pkg.name, moduleUrl],
    [`${pkg.name}/`, `${moduleUrl}/`],
  ]
}

/**
 * @internal
 */
export function getModuleUrl(
  pkg: Package,
  options: {appId?: string; baseUrl?: string; timestamp?: number} = {},
) {
  const {timestamp = currentUnixTime()} = options
  return options.appId
    ? getByAppModuleUrl(pkg, {appId: options.appId, baseUrl: options.baseUrl, timestamp})
    : getLegacyModuleUrl(pkg, {baseUrl: options.baseUrl, timestamp})
}

function getLegacyModuleUrl(pkg: Package, options: {baseUrl?: string; timestamp: number}) {
  const encodedMinVer = encodeURIComponent(`^${pkg.version}`)
  return `${options.baseUrl || MODULES_HOST}/v1/modules/${rewriteScopedPackage(pkg.name)}/default/${encodedMinVer}/t${options.timestamp}`
}

function getByAppModuleUrl(
  pkg: Package,
  options: {appId: string; baseUrl?: string; timestamp: number},
) {
  const encodedMinVer = encodeURIComponent(`^${pkg.version}`)
  return `${options.baseUrl || MODULES_HOST}/v1/modules/by-app/${options.appId}/t${options.timestamp}/${encodedMinVer}/${rewriteScopedPackage(pkg.name)}`
}

/**
 * replaces '/' with '__' similar to how eg `@types/scope__pkg` are rewritten
 * scoped packages are stored this way both in the manifest and in the cloud storage bucket
 */
function rewriteScopedPackage(pkgName: string) {
  if (!pkgName.includes('@')) {
    return pkgName
  }
  const [scope, ...pkg] = pkgName.split('/')
  return `${scope}__${pkg.join('')}`
}

type PackageWithCss = Package & {cssFile?: string}

/**
 * Generate CDN CSS URLs for auto-updated packages.
 * Uses the same URL pattern as JS module URLs so the module server
 * resolves CSS and JS to the same version.
 *
 * @internal
 */
export function getAutoUpdatesCssUrls<const Pkg extends PackageWithCss>(
  packages: Pkg[],
  options: {appId?: string; baseUrl?: string; timestamp?: number} = {},
): string[] {
  return packages
    .filter((pkg): pkg is Pkg & {cssFile: string} => Boolean(pkg.cssFile))
    .map((pkg) => `${getModuleUrl(pkg, options)}/${pkg.cssFile}`)
}
