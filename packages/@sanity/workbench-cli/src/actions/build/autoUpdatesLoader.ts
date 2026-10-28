type Module = Record<string, unknown>

// Workbench's `load`, contract version 1: it loads every specifier as the app's own copy, with its
// app ID and vendor modules, and links the stylesheets.
type Load = (
  appId: string,
  request: {
    imports: Record<string, string>
    specifiers: string[]
    styles: string[]
    vendor: Record<string, () => Promise<Module>>
  },
) => Promise<{modules: Record<string, Module>}>

interface AutoUpdatesLoaderOptions {
  appId: string
  cssUrls: string[]
  imports: Record<string, string>
  specifiers: string[]
  vendor: Record<string, () => Promise<Module>>
}

const TIMESTAMP = /(\/(?:by-app|default)\/[^/]+)\/t\d+/

// Loads the app's auto-updated packages from the module server as its own copy.
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
      url.replace(TIMESTAMP, `$1${timestamp}`),
    ]),
  )
  let modules: Record<string, Module> | undefined
  let ready: Promise<void> | undefined

  return {
    importMapUrl: (specifier: string) => (modules ? currentImports[specifier] : undefined),
    load,
  }

  async function load(specifier: string): Promise<Module> {
    ready ??= prepare()
    await ready
    if (!modules) throw new Error('The auto update loader is not installed in dashboard')

    const module = modules?.[specifier]
    if (!module) throw new Error(`${specifier} was not loaded from the module server`)

    return module
  }

  async function prepare(): Promise<void> {
    const workbench = (
      globalThis as {[key: symbol]: {versions?: Record<number, Load>} | undefined}
    )[Symbol.for('sanity.autoUpdates')]
    const result = await workbench?.versions?.[1]?.(appId, {
      imports: currentImports,
      specifiers,
      styles: cssUrls.map((url) => url.replace(TIMESTAMP, `$1${timestamp}`)),
      vendor,
    })
    modules = result?.modules
  }
}
