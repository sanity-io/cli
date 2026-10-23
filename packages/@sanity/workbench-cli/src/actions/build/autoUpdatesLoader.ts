import {importThroughShim} from './autoUpdatesShim.js'

type Module = Record<string, unknown>

export interface ModuleCdnPackage {
  name: string
  url: string

  cssUrl?: string
}

interface AutoUpdatesLoaderOptions {
  appId: string | undefined
  packages: ModuleCdnPackage[]
  shared: Record<string, () => Promise<Module>>
  specifiers: string[]
}

// Loads the app's CDN packages as its own instance; if any fails, the app uses its bundled copies.
export function createAutoUpdatesLoader({
  appId,
  packages,
  shared,
  specifiers,
}: AutoUpdatesLoaderOptions) {
  const timestamp = `/t${Math.floor(Date.now() / 1000)}`
  const fresh = packages.map(({cssUrl, name, url}) => ({
    cssUrl: cssUrl?.replace(/\/t\d+/, timestamp),
    name,
    url: url.replace(/\/t\d+/, timestamp),
  }))
  const modules = new Map<string, Module>()
  let ready: Promise<boolean> | undefined

  return {
    load,
    moduleUrl: (name: string) =>
      modules.size > 0 ? fresh.find((pkg) => pkg.name === name)?.url : undefined,
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
      const importCdn = await importThroughShim({
        appId,
        imports: Object.fromEntries(
          // Every package, since the CDN bundles import each other (`@sanity/sdk-react` imports `@sanity/sdk`).
          fresh.flatMap(({name, url}) => [
            [name, url],
            [`${name}/`, `${url}/`],
          ]),
        ),
        shared,
      })
      // All or nothing: one bundled package would pull in bundled copies of the others.
      const loaded = await Promise.all(
        specifiers.map(async (specifier) => {
          const pkg = fresh.find(({name}) => name === packageOf(specifier))!

          return [specifier, await importCdn(pkg.url + specifier.slice(pkg.name.length))] as const
        }),
      )
      for (const [specifier, module] of loaded) modules.set(specifier, module)
    } catch (error) {
      // eslint-disable-next-line no-console -- the app keeps working, but no longer auto-updates
      console.warn('Failed to load from the module CDN, using the bundled copy', error)

      return false
    }

    for (const {cssUrl, name} of fresh) {
      if (
        !cssUrl ||
        !specifiers.some((specifier) => packageOf(specifier) === name) ||
        [...document.querySelectorAll('link')].some(({href}) => href === cssUrl)
      ) {
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

function packageOf(specifier: string): string {
  return specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')
}
