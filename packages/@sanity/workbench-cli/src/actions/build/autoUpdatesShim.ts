type Module = Record<string, unknown>

interface ImportShim {
  (url: string): Promise<Module>
  addImportMap: (importMap: {imports?: Record<string, string>; scopes?: object}) => void
}

interface Instance {
  appId: string | undefined
  modules: Record<string, Module>
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

// Loads CDN modules under `<page origin>/~<instance>/<cdn host>/<path>`: each app gets its own
// module state and app ID, plus its own react etc. where they differ from the page's.
export async function importThroughShim({
  appId,
  imports,
  ownInstances,
}: {
  appId: string | undefined
  imports: Record<string, string>
  ownInstances: Record<string, Module>
}): Promise<(url: string) => Promise<Module>> {
  const globals = globalThis as Globals
  const importShim = globals.importShim ?? (await loadImportShim(globals))
  if (!globals[INSTANCES]) {
    throw new Error('es-module-shims was loaded without the auto-updates hooks')
  }

  const id = `i${globals[INSTANCES].size}`
  globals[INSTANCES].set(id, {appId, modules: ownInstances})
  const prefix = `${location.origin}/~${id}/`
  const toInstance = (url: string) => prefix + url.replace(/^https?:\/\//, '')
  importShim.addImportMap({
    scopes: {
      [prefix]: {
        ...Object.fromEntries(
          Object.entries(imports).map(([specifier, url]) => [specifier, toInstance(url)]),
        ),
        ...Object.fromEntries(
          Object.entries(ownInstances).map(([specifier, module]) => [
            specifier,
            reexport(id, specifier, module),
          ]),
        ),
      },
    },
  })

  return (url) => importShim(toInstance(url))
}

async function loadImportShim(globals: Globals): Promise<ImportShim> {
  // es-module-shims skips these, so CDN code imports the page's react etc. natively.
  const documentImports = Object.fromEntries(
    [...document.querySelectorAll('script[type="importmap"]')].flatMap((script) =>
      Object.entries<string>(JSON.parse(script.textContent || '{}').imports ?? {}).map(
        ([specifier, url]) => [specifier, new URL(url, document.baseURI).href],
      ),
    ),
  )
  const instances = new Map<string, Instance>()
  globals[INSTANCES] = instances
  globals.esmsInitOptions = {
    shimMode: true,
    skip: Object.values(documentImports),
    source: async (
      url: string,
      fetchOpts: RequestInit,
      parent: string,
      defaultSourceHook: (url: string, fetchOpts: RequestInit, parent: string) => unknown,
    ) => {
      const [, id, path] = VIRTUAL_URL.exec(url) ?? []
      const instance = id && instances.get(id)
      if (!instance) return defaultSourceHook(url, fetchOpts, parent)

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
  globals.importShim!.addImportMap({imports: documentImports})

  return globals.importShim!
}

function reexport(id: string, specifier: string, module: Module): string {
  const names = Object.keys(module).filter((name) => name !== 'default')
  const code = `const m = globalThis[Symbol.for(${JSON.stringify(INSTANCES_KEY)})].get(${JSON.stringify(id)}).modules[${JSON.stringify(specifier)}]
${'default' in module ? 'export default m.default\n' : ''}${names.map((name, index) => `const e${index} = m[${JSON.stringify(name)}]`).join('\n')}
export {${names.map((name, index) => `e${index} as ${JSON.stringify(name)}`).join(', ')}}
`

  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- browser code
  return URL.createObjectURL(new Blob([code], {type: 'text/javascript'}))
}
