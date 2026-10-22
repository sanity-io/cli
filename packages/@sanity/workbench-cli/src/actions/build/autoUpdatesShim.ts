type Module = Record<string, unknown>

interface ImportShim {
  (url: string): Promise<Module>
  addImportMap: (importMap: {imports: Record<string, string>; scopes: object}) => void
}

/**
 * Loads module CDN packages through es-module-shims where the browser ignores import maps added
 * after load (Firefox while `dom.multiple_import_maps.enabled` is off, Mozilla bug 2021012).
 * Delete this module and its call in `autoUpdatesLoader.ts` once every supported browser applies them.
 */
export async function importThroughShim(scopes: object): Promise<(url: string) => Promise<Module>> {
  // The document's own entries load natively, so the CDN code shares the page's instances.
  const documentImports = Object.fromEntries(
    [...document.querySelectorAll('script[type="importmap"]')].flatMap((script) =>
      Object.entries<string>(JSON.parse(script.textContent || '{}').imports ?? {}).map(
        ([specifier, url]) => [specifier, new URL(url, document.baseURI).href],
      ),
    ),
  )
  const globals = globalThis as {esmsInitOptions?: object; importShim?: ImportShim}

  // Another app on the page may have loaded it already.
  if (!globals.importShim) {
    globals.esmsInitOptions = {shimMode: true, skip: Object.values(documentImports)}
    // eslint-disable-next-line no-restricted-syntax -- package import in browser code, not a file path
    await import('es-module-shims')
  }

  const importShim = globals.importShim!
  importShim.addImportMap({imports: documentImports, scopes})

  return (url) => importShim(url)
}
