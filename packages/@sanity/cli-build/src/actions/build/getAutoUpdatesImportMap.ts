import {isStaging} from '@sanity/cli-core/util'

import {type ModuleCdnPackage} from './autoUpdates.js'

function getModulesHost() {
  return (
    process.env.SANITY_MODULES_HOST ||
    (isStaging() ? 'https://sanity-cdn.work' : 'https://sanity-cdn.com')
  )
}

function currentUnixTime(): number {
  return Math.floor(Date.now() / 1000)
}

type Package = {name: string; version: string}
type PackageWithCss = Package & {cssFile?: string}

/**
 * @internal
 */
export function getModuleCdnPackages(
  packages: PackageWithCss[],
  options: {appId?: string; baseUrl?: string; timestamp?: number} = {},
): ModuleCdnPackage[] {
  return packages.map((pkg) => {
    const url = getModuleUrl(pkg, options)

    return pkg.cssFile
      ? {cssUrl: `${url}/${pkg.cssFile}`, name: pkg.name, url}
      : {name: pkg.name, url}
  })
}

/**
 * @internal
 */
export function getAutoUpdatesImportMap(packages: ModuleCdnPackage[]): Record<string, string> {
  return Object.fromEntries(
    packages.flatMap(({name, url}) => [
      [name, url],
      [`${name}/`, `${url}/`],
    ]),
  )
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
  return `${options.baseUrl || getModulesHost()}/v1/modules/${rewriteScopedPackage(pkg.name)}/default/${encodedMinVer}/t${options.timestamp}`
}

function getByAppModuleUrl(
  pkg: Package,
  options: {appId: string; baseUrl?: string; timestamp: number},
) {
  const encodedMinVer = encodeURIComponent(`^${pkg.version}`)
  return `${options.baseUrl || getModulesHost()}/v1/modules/by-app/${options.appId}/t${options.timestamp}/${encodedMinVer}/${rewriteScopedPackage(pkg.name)}`
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

/**
 * @internal
 */
export function getAutoUpdatesCssUrls(packages: ModuleCdnPackage[]): string[] {
  return packages.flatMap(({cssUrl}) => (cssUrl ? [cssUrl] : []))
}
