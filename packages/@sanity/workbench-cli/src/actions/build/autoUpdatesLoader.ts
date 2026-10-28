type Module = Record<string, unknown>

// Workbench's `load`, contract version 1: it loads every specifier as the app's own copy, with its
// app ID and vendor modules, links the stylesheets, and returns undefined for an app it didn't prepare.
type Load = (
  appId: string,
  request: {
    imports: Record<string, string>
    specifiers: string[]
    styles: string[]
    vendor: Record<string, () => Promise<Module>>
  },
) => Promise<{modules: Record<string, Module>} | undefined>

interface AutoUpdatesLoaderOptions {
  appId: string
  cssUrls: string[]
  imports: Record<string, string>
  specifiers: string[]
  vendor: Record<string, () => Promise<Module>>
}

const TIMESTAMP = /(\/by-app\/[^/]+)\/t\d+/

// Loads the app's auto-updated packages from the module server as its own copy; if any fails,
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
      url.replace(TIMESTAMP, `$1${timestamp}`),
    ]),
  )
  let modules: Record<string, Module> | undefined
  let ready: Promise<boolean> | undefined

  return {
    importMapUrl: (specifier: string) => (modules ? currentImports[specifier] : undefined),
    load,
  }

  async function load(specifier: string, bundled: () => Promise<Module>): Promise<Module> {
    ready ??= prepare()
    if (!(await ready)) return bundled()

    const module = modules?.[specifier]
    if (!module) throw new Error(`${specifier} was not loaded from the module server`)

    return module
  }

  async function prepare(): Promise<boolean> {
    try {
      const workbench = (
        globalThis as {[key: symbol]: {versions?: Record<number, Load>} | undefined}
      )[Symbol.for('sanity.autoUpdates')]
      const workbenchLoad = workbench?.versions?.[1]
      if (!workbenchLoad) throw new Error('This Workbench does not load auto-updating apps')

      const result = await workbenchLoad(appId, {
        imports: currentImports,
        specifiers,
        styles: cssUrls.map((url) => url.replace(TIMESTAMP, `$1${timestamp}`)),
        vendor,
      })
      if (!result) throw new Error(`Workbench did not prepare ${appId} for auto-updates`)

      modules = result.modules

      return true
    } catch (error) {
      // eslint-disable-next-line no-console -- the app keeps working, but no longer auto-updates
      console.warn('Failed to load from the module server, using the bundled copy', error)

      return false
    }
  }
}
