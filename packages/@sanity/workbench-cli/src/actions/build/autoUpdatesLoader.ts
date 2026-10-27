type Module = Record<string, unknown>

// Workbench's `load`, contract version 2: it loads the app's imports as the app's own copy, with its
// app ID, and returns undefined for an app it didn't prepare.
type Load = (
  appId: string,
  request: {
    imports: Record<string, string>
    source: (url: string) => Promise<{code: string; url: string}>
  },
) => Promise<((specifier: string) => Promise<Module>) | undefined>

interface AutoUpdatesLoaderOptions {
  appId: string
  cssUrls: string[]
  imports: Record<string, string>
  specifiers: string[]
  vendor: Record<string, () => Promise<Module>>
}

const VENDOR_KEY = 'sanity.autoUpdates.vendor'
// `.invalid` never resolves, so these URLs only ever reach `source`.
const VENDOR_ORIGIN = 'https://vendor.invalid/'
const TIMESTAMP = /\/t\d+(?=\/|$)/

// Loads the app's auto-updated packages from the module CDN as its own instance; if any fails,
// the app uses the bundled copies of all of them.
export function createAutoUpdatesLoader({
  appId,
  cssUrls,
  imports,
  specifiers,
  vendor,
}: AutoUpdatesLoaderOptions) {
  // The build's timestamp would pin the versions the module CDN served on build day.
  const timestamp = `/t${Math.floor(Date.now() / 1000)}`
  const currentImports = Object.fromEntries(
    Object.entries(imports).map(([specifier, url]) => [
      specifier,
      url.replace(TIMESTAMP, timestamp),
    ]),
  )
  const modules = new Map<string, Module>()
  let ready: Promise<boolean> | undefined

  return {
    importMapUrl: (specifier: string) => (modules.size > 0 ? currentImports[specifier] : undefined),
    load,
  }

  async function load(specifier: string, bundled: () => Promise<Module>): Promise<Module> {
    ready ??= prepare()
    if (!(await ready)) return bundled()

    const module = modules.get(specifier)
    if (!module) throw new Error(`${specifier} was not loaded from the module CDN`)

    return module
  }

  async function prepare(): Promise<boolean> {
    if (typeof document === 'undefined') return false

    try {
      const importModule = await loadInWorkbench({appId, imports: currentImports, vendor})
      // All or nothing: one bundled package would pull in bundled copies of the others.
      const loaded = await Promise.all(
        specifiers.map(async (specifier) => [specifier, await importModule(specifier)] as const),
      )
      for (const [specifier, module] of loaded) modules.set(specifier, module)
    } catch (error) {
      // eslint-disable-next-line no-console -- the app keeps working, but no longer auto-updates
      console.warn('Failed to load from the module CDN, using the bundled copy', error)

      return false
    }

    for (const href of cssUrls.map((url) => url.replace(TIMESTAMP, timestamp))) {
      if ([...document.querySelectorAll('link')].some((link) => link.href === href)) continue

      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      document.head.append(link)
    }

    return true
  }
}

async function loadInWorkbench({
  appId,
  imports,
  vendor,
}: Pick<AutoUpdatesLoaderOptions, 'appId' | 'imports' | 'vendor'>) {
  const workbench = (globalThis as {[key: symbol]: {versions?: Record<number, Load>} | undefined})[
    Symbol.for('sanity.autoUpdates')
  ]
  const load = workbench?.versions?.[2]
  if (!load) throw new Error('This Workbench does not load auto-updating apps')

  const vendorModules: Record<string, Module> = {}
  const registry = ((globalThis as {[key: symbol]: unknown})[Symbol.for(VENDOR_KEY)] ??= new Map())
  ;(registry as Map<string, Record<string, Module>>).set(appId, vendorModules)
  const importModule = await load(appId, {
    imports: {
      ...imports,
      ...Object.fromEntries(
        Object.keys(vendor).map((specifier) => [specifier, VENDOR_ORIGIN + specifier]),
      ),
    },
    async source(url) {
      if (url.startsWith(VENDOR_ORIGIN)) {
        const specifier = url.slice(VENDOR_ORIGIN.length)
        vendorModules[specifier] = await vendor[specifier]()

        return {code: reexport(appId, specifier, vendorModules[specifier]), url}
      }

      const response = await fetch(url)
      if (!response.ok) throw new Error(`${response.url} responded with ${response.status}`)

      return {code: await response.text(), url: response.url}
    },
  })
  if (!importModule) throw new Error(`Workbench did not prepare ${appId} for auto-updates`)

  return importModule
}

function reexport(appId: string, specifier: string, module: Module): string {
  const names = Object.keys(module).filter((name) => name !== 'default')
  return `const m = globalThis[Symbol.for(${JSON.stringify(VENDOR_KEY)})].get(${JSON.stringify(appId)})[${JSON.stringify(specifier)}]
${'default' in module ? 'export default m.default\n' : ''}${names.map((name, index) => `const e${index} = m[${JSON.stringify(name)}]`).join('\n')}
export {${names.map((name, index) => `e${index} as ${JSON.stringify(name)}`).join(', ')}}
`
}
