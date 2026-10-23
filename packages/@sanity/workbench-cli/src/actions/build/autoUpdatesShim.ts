type Module = Record<string, unknown>

interface ImportShim {
  (url: string): Promise<Module>
  addImportMap: (importMap: {scopes: object}) => void
}

interface Instance {
  appId: string | undefined
  modules: Record<string, Module>
  shared: Record<string, () => Promise<Module>>
}

interface Globals {
  esmsInitOptions?: object
  importShim?: ImportShim
  [INSTANCES]?: Map<string, Instance>
}

// Bump when the registry, virtual URL or re-export shape changes; mismatched remotes fall back.
const INSTANCES_KEY = 'sanity.autoUpdates.instances.v1'
const INSTANCES = Symbol.for(INSTANCES_KEY)
const VIRTUAL_URL = /^https?:\/\/[^/]+\/~([^/]+)\/(.*)$/
// Path prefix of the app's shared modules; CDN paths start with a host name instead.
const SHARED = 'shared/'

// Loads CDN modules under `<page origin>/~<instance>/<cdn host>/<path>`: each app gets its own
// module state and app ID, and its own module federation copies of react etc.
export async function importThroughShim({
  appId,
  imports,
  shared,
}: {
  appId: string | undefined
  imports: Record<string, string>
  shared: Record<string, () => Promise<Module>>
}): Promise<(url: string) => Promise<Module>> {
  const globals = globalThis as Globals
  const importShim = globals.importShim ?? (await loadImportShim(globals))
  if (!globals[INSTANCES]) {
    throw new Error('es-module-shims was loaded without the auto-updates hooks')
  }

  const id = `i${globals[INSTANCES].size}`
  globals[INSTANCES].set(id, {appId, modules: {}, shared})
  const prefix = `${location.origin}/~${id}/`
  const toInstance = (url: string) => prefix + url.replace(/^https?:\/\//, '')
  importShim.addImportMap({
    scopes: {
      [prefix]: {
        ...Object.fromEntries(
          Object.entries(imports).map(([specifier, url]) => [specifier, toInstance(url)]),
        ),
        ...Object.fromEntries(
          Object.keys(shared).map((specifier) => [specifier, prefix + SHARED + specifier]),
        ),
      },
    },
  })

  return (url) => importShim(toInstance(url))
}

async function loadImportShim(globals: Globals): Promise<ImportShim> {
  const instances = new Map<string, Instance>()
  globals[INSTANCES] = instances
  globals.esmsInitOptions = {
    shimMode: true,
    source: async (
      url: string,
      fetchOpts: RequestInit,
      parent: string,
      defaultSourceHook: (url: string, fetchOpts: RequestInit, parent: string) => unknown,
    ) => {
      const [, id, path] = VIRTUAL_URL.exec(url) ?? []
      const instance = id && instances.get(id)
      if (!instance) return defaultSourceHook(url, fetchOpts, parent)

      if (path.startsWith(SHARED)) {
        const specifier = path.slice(SHARED.length)
        instance.modules[specifier] = await instance.shared[specifier]()

        return {source: reexport(id, specifier, instance.modules[specifier]), type: 'js'}
      }

      const response = await fetch(`https://${path}`, fetchOpts)
      if (!response.ok) throw new Error(`${response.url} responded with ${response.status}`)

      return {
        // Inlines the app ID like the app build's `define`, which never runs on CDN code.
        source: (await response.text()).replaceAll(
          /(?<![\w$.])__SANITY_APP_ID__(?![\w$])/g,
          JSON.stringify(instance.appId) ?? 'undefined',
        ),
        type: 'js',
        url: `${location.origin}/~${id}/${response.url.replace(/^https?:\/\//, '')}`,
      }
    },
  }
  // @ts-expect-error -- its types declare globals, not a module
  await import('es-module-shims') // eslint-disable-line no-restricted-syntax -- package import in browser code

  return globals.importShim!
}

function reexport(id: string, specifier: string, module: Module): string {
  const names = Object.keys(module).filter((name) => name !== 'default')
  return `const m = globalThis[Symbol.for(${JSON.stringify(INSTANCES_KEY)})].get(${JSON.stringify(id)}).modules[${JSON.stringify(specifier)}]
${'default' in module ? 'export default m.default\n' : ''}${names.map((name, index) => `const e${index} = m[${JSON.stringify(name)}]`).join('\n')}
export {${names.map((name, index) => `e${index} as ${JSON.stringify(name)}`).join(', ')}}
`
}
