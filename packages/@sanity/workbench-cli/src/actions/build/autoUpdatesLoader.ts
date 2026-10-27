type Module = Record<string, unknown>

interface ImportShim {
  (specifier: string, parentUrl: string): Promise<Module>
  addImportMap: (importMap: {scopes: Record<string, Record<string, string>>}) => void
}

interface Instance {
  source: (
    path: string,
    fetchOpts: RequestInit,
  ) => Promise<{source: string; type: 'js'; url?: string}>
  vendorModules: Record<string, Module>
}

// Installed by Workbench: es-module-shims routes each `<page origin>/~<id>/` request to `instances.get(id).source`.
interface Host {
  instances: Map<string, Instance>
  loadImportShim: () => Promise<ImportShim>
}

interface AutoUpdatesLoaderOptions {
  appId: string
  cssUrls: string[]
  imports: Record<string, string>
  specifiers: string[]
  vendor: Record<string, () => Promise<Module>>
}

const HOST_KEY = 'sanity.autoUpdates.host.v1'
// Path prefix of vendor modules; module CDN paths start with a host name instead.
const VENDOR_PATH = 'vendor/'
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
      const importInInstance = await createInstance({appId, imports: currentImports, vendor})
      // All or nothing: one bundled package would pull in bundled copies of the others.
      const loaded = await Promise.all(
        specifiers.map(
          async (specifier) => [specifier, await importInInstance(specifier)] as const,
        ),
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

// Maps the app's imports and vendor modules under `<page origin>/~<instance>/`, so its modules
// get URLs, module state and an app ID of their own.
async function createInstance({
  appId,
  imports,
  vendor,
}: Pick<AutoUpdatesLoaderOptions, 'appId' | 'imports' | 'vendor'>) {
  const host = (globalThis as {[key: symbol]: Host | undefined})[Symbol.for(HOST_KEY)]
  if (!host) throw new Error('This Workbench does not load auto-updating apps')

  const importShim = await host.loadImportShim()
  const id = `i${host.instances.size}`
  const prefix = `${location.origin}/~${id}/`
  const instance: Instance = {
    async source(path, fetchOpts) {
      if (path.startsWith(VENDOR_PATH)) {
        const specifier = path.slice(VENDOR_PATH.length)
        instance.vendorModules[specifier] = await vendor[specifier]()

        return {source: reexport(id, specifier, instance.vendorModules[specifier]), type: 'js'}
      }

      const response = await fetch(`https://${path}`, fetchOpts)
      if (!response.ok) throw new Error(`${response.url} responded with ${response.status}`)

      return {
        // Inlines the app ID like the app build's `define`, which never runs on module CDN code.
        source: (await response.text()).replaceAll(
          /(?<![\w$.])__SANITY_APP_ID__(?![\w$])/g,
          JSON.stringify(appId),
        ),
        type: 'js',
        url: prefix + response.url.replace(/^https?:\/\//, ''),
      }
    },
    vendorModules: {},
  }
  host.instances.set(id, instance)
  importShim.addImportMap({
    scopes: {
      [prefix]: {
        ...Object.fromEntries(
          Object.entries(imports).map(([specifier, url]) => [
            specifier,
            prefix + url.replace(/^https?:\/\//, ''),
          ]),
        ),
        ...Object.fromEntries(
          Object.keys(vendor).map((specifier) => [specifier, prefix + VENDOR_PATH + specifier]),
        ),
      },
    },
  })

  return (specifier: string) => importShim(specifier, prefix)
}

function reexport(id: string, specifier: string, module: Module): string {
  const names = Object.keys(module).filter((name) => name !== 'default')
  return `const m = globalThis[Symbol.for(${JSON.stringify(HOST_KEY)})].instances.get(${JSON.stringify(id)}).vendorModules[${JSON.stringify(specifier)}]
${'default' in module ? 'export default m.default\n' : ''}${names.map((name, index) => `const e${index} = m[${JSON.stringify(name)}]`).join('\n')}
export {${names.map((name, index) => `e${index} as ${JSON.stringify(name)}`).join(', ')}}
`
}
