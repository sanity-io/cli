import {importThroughShim} from './autoUpdatesShim.js'

type Module = Record<string, unknown>

interface CdnPackage {
  css: string[]
  name: string
  url: string
}

interface AutoUpdatesLoaderOptions {
  /** The app's bus identity, which the bundled copy has inlined as `__SANITY_APP_ID__`. */
  appId: string | undefined
  /** Native dynamic import, resolved against the document's import maps. */
  importModule: (specifier: string) => Promise<Module>
  /** By-app module CDN URLs, as in the standalone import map. */
  packages: CdnPackage[]
  /** The `react` the app resolved through the module federation share scope. */
  react: Module
}

const IMPORT_MAP_PROBE = 'sanity-auto-updates-import-map-probe'

/**
 * Loads CDN packages from the module CDN, or the app's bundled copy when the document lacks the app's `react`.
 * The CDN bundles import each other by bare specifier, so the standalone import map entries are registered scoped to their version directories.
 */
export function createAutoUpdatesLoader({
  appId,
  importModule,
  packages,
  react,
}: AutoUpdatesLoaderOptions) {
  const timestamp = `/t${Math.floor(Date.now() / 1000)}`
  const fresh = packages.map((pkg) => ({
    css: pkg.css.map((href) => href.replace(/\/t\d+/, timestamp)),
    name: pkg.name,
    url: pkg.url.replace(/\/t\d+/, timestamp),
  }))
  let ready: Promise<boolean> | undefined
  let importCdn = importModule
  const loadedFrom = new Map<string, string>()

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

    // The CDN packages read it at runtime. Page-wide, so the first CDN-loaded app on a page wins.
    // TODO(SDK-2213): pass the app ID to `sanity` per instance instead.
    ;(globalThis as {__SANITY_APP_ID__?: string}).__SANITY_APP_ID__ ??= appId

    for (const href of fresh.flatMap(({css}) => css)) {
      if ([...document.querySelectorAll('link')].some((link) => link.href === href)) continue

      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
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
