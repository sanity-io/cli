import {importThroughShim} from './autoUpdatesShim.js'

type Module = Record<string, unknown>

export interface ModuleCdnPackage {
  name: string
  url: string

  cssUrl?: string
}

interface AutoUpdatesLoaderOptions {
  appId: string | undefined
  importModule: (specifier: string) => Promise<Module>
  packages: ModuleCdnPackage[]
  react: Module
}

const IMPORT_MAP_PROBE = 'sanity-auto-updates-import-map-probe'

/**
 * Loads module CDN packages, or the app's bundled copy when the page can't run them with the
 * app's `react`. The CDN bundles import each other by bare specifier, so the standalone import
 * map entries are registered scoped to their version directories.
 */
export function createAutoUpdatesLoader({
  appId,
  importModule,
  packages,
  react,
}: AutoUpdatesLoaderOptions) {
  const timestamp = `/t${Math.floor(Date.now() / 1000)}`
  const fresh = packages.map(({cssUrl, name, url}) => ({
    cssUrl: cssUrl?.replace(/\/t\d+/, timestamp),
    name,
    url: url.replace(/\/t\d+/, timestamp),
  }))
  const loadedFrom = new Map<string, string>()
  let importCdn = importModule
  let ready: Promise<boolean> | undefined

  return {load, moduleUrl: (name: string) => loadedFrom.get(name)}

  async function load(specifier: string, bundled: () => Promise<Module>): Promise<Module> {
    const pkg = fresh.find(({name}) => specifier === name || specifier.startsWith(`${name}/`))
    ready ??= prepare()

    if (!pkg || !(await ready)) {
      return bundled()
    }

    try {
      const module = await importCdn(pkg.url + specifier.slice(pkg.name.length))
      loadedFrom.set(pkg.name, pkg.url)

      return module
    } catch (error) {
      // eslint-disable-next-line no-console -- the app keeps working, but no longer auto-updates
      console.warn(`Failed to load ${specifier} from the module CDN, using the bundled copy`, error)

      return bundled()
    }
  }

  async function prepare(): Promise<boolean> {
    if (typeof document === 'undefined') return false

    let appliesAddedImportMaps: boolean
    try {
      const documentReact = await importModule('react')
      if (documentReact.createContext !== react.createContext) return false

      addImportMap({imports: {[IMPORT_MAP_PROBE]: 'data:text/javascript,'}})
      appliesAddedImportMaps = await importModule(IMPORT_MAP_PROBE).then(
        () => true,
        () => false,
      )
    } catch {
      return false
    }

    try {
      // Each by-app URL redirects to the version directory its modules load from.
      const directories = await Promise.all(
        fresh.map(async ({url}) => {
          const response = await fetch(url, {method: 'HEAD'})
          if (!response.ok) throw new Error(`${url} responded with ${response.status}`)

          return new URL('.', response.url).href
        }),
      )
      const imports = Object.fromEntries(
        fresh.flatMap(({name, url}) => [
          [name, url],
          [`${name}/`, `${url}/`],
        ]),
      )
      const scopes = Object.fromEntries(directories.map((dir) => [dir, imports]))

      if (appliesAddedImportMaps) {
        addImportMap({scopes})
      } else {
        importCdn = await importThroughShim(scopes)
      }
    } catch (error) {
      // eslint-disable-next-line no-console -- the app keeps working, but no longer auto-updates
      console.warn('Failed to resolve the module CDN, using the bundled copy', error)

      return false
    }

    // The CDN copies of `@sanity/runtime` read the message bus app ID from this global, since
    // the app's build doesn't compile them. Page-wide: the first CDN-loaded app on a page sets it.
    ;(globalThis as {__SANITY_APP_ID__?: string}).__SANITY_APP_ID__ ??= appId

    for (const {cssUrl} of fresh) {
      if (!cssUrl || [...document.querySelectorAll('link')].some(({href}) => href === cssUrl)) {
        continue
      }

      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = cssUrl
      document.head.append(link)
    }

    return true
  }
}

function addImportMap(importMap: {imports?: Record<string, string>; scopes?: object}) {
  const script = document.createElement('script')
  script.type = 'importmap'
  script.textContent = JSON.stringify(importMap)
  document.head.append(script)
}
