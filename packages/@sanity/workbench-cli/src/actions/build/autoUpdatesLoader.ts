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
  let modules: Promise<Record<string, Module>> | undefined

  return {imports: currentImports, load}

  async function load(specifier: string): Promise<Module> {
    modules ??= loadModules()
    const module = (await modules)[specifier]
    if (!module) throw new Error(`${specifier} was not loaded from the module server`)

    return module
  }

  async function loadModules(): Promise<Record<string, Module>> {
    const workbenchLoad = (
      globalThis as {[key: symbol]: {versions?: Record<number, Load>} | undefined}
    )[Symbol.for('sanity.autoUpdates')]?.versions?.[1]
    if (!workbenchLoad) throw new Error('The auto update loader is not installed in dashboard')

    return (
      await workbenchLoad(appId, {
        imports: currentImports,
        specifiers,
        styles: cssUrls.map((url) => url.replace(TIMESTAMP, `$1${timestamp}`)),
        vendor,
      })
    ).modules
  }
}
