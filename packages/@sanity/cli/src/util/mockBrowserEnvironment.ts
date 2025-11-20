import {ResizeObserver} from '@juggle/resize-observer'
import {register as registerESBuild} from 'esbuild-register/dist/node'
import jsdomGlobal from 'jsdom-global'
import {addHook} from 'pirates'
import resolveFrom from 'resolve-from'

import {getStudioEnvironmentVariables} from '../actions/build/getStudioEnvironmentVariables'

const jsdomDefaultHtml = `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body></body>
</html>`

export function mockBrowserEnvironment(basePath: string): () => void {
  // Guard against double-registering
  if (globalThis && globalThis.window && '__mockedBySanity' in globalThis.window) {
    return () => {
      /* intentional noop */
    }
  }

  const domCleanup = jsdomGlobal(jsdomDefaultHtml, {url: 'http://localhost:3333/'})
  const windowCleanup = () => globalThis.window.close()
  const globalCleanup = provideFakeGlobals(basePath)
  const cleanupFileLoader = addHook(
    (code, filename) => `module.exports = ${JSON.stringify(filename)}`,
    {
      exts: getFileExtensions(),
      ignoreNodeModules: false,
    },
  )

  const {unregister: unregisterESBuild} = registerESBuild({
    define: {
      // define the `process.env` global
      ...getStudioEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'}),
      // define the `import.meta.env` global
      ...getStudioEnvironmentVariables({jsonEncode: true, prefix: 'import.meta.env.'}),
    },
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
    format: 'cjs',
    jsx: 'automatic',
    supported: {'dynamic-import': true},
    target: 'node18',
  })

  return function cleanupBrowserEnvironment() {
    unregisterESBuild()
    cleanupFileLoader()
    globalCleanup()
    windowCleanup()
    domCleanup()
  }
}

const getFakeGlobals = (basePath: string) => ({
  __mockedBySanity: true,
  ace: tryGetAceGlobal(basePath),
  cancelAnimationFrame: clearImmediate,
  cancelIdleCallback: clearImmediate,
  customElements: globalThis.window?.customElements,
  InputEvent: globalThis.window?.InputEvent,
  matchMedia:
    globalThis.window?.matchMedia ||
    (() => ({
      matches: false,
      media: '',
      onchange: null,
    })),
  requestAnimationFrame: setImmediate,
  requestIdleCallback: setImmediate,
  ResizeObserver: globalThis.window?.ResizeObserver || ResizeObserver,
})

const getFakeDocumentProps = () => ({
  execCommand: function execCommand(
    // Provide the right arity for the function, even if unused
    _commandName: string,
    _showDefaultUI: boolean,
    _valueArgument: unknown,
  ) {
    // Return false to indicate "unsupported"
    return false
  },
})

function provideFakeGlobals(basePath: string): () => void {
  const globalEnv = globalThis as unknown as Record<string, unknown>
  const globalWindow = globalThis.window as unknown as Record<string, unknown>
  const globalDocument = (globalThis.document || document || {}) as unknown as Record<
    string,
    unknown
  >

  const fakeGlobals = getFakeGlobals(basePath)
  const fakeDocumentProps = getFakeDocumentProps()

  const stubbedGlobalKeys: string[] = []
  const stubbedWindowKeys: string[] = []
  const stubbedDocumentKeys: string[] = []

  for (const [rawKey, value] of Object.entries(fakeGlobals)) {
    if (value === undefined) {
      continue
    }

    const key = rawKey as keyof typeof fakeGlobals

    if (!(key in globalEnv)) {
      globalEnv[key] = fakeGlobals[key]
      stubbedGlobalKeys.push(key)
    }

    if (!(key in globalThis.window)) {
      globalWindow[key] = fakeGlobals[key]
      stubbedWindowKeys.push(key)
    }
  }

  for (const [rawKey, value] of Object.entries(fakeDocumentProps)) {
    if (value === undefined) {
      continue
    }

    const key = rawKey as keyof typeof fakeDocumentProps
    if (!(key in globalDocument)) {
      globalDocument[key] = fakeDocumentProps[key]
      stubbedDocumentKeys.push(key)
    }
  }

  return () => {
    for (const key of stubbedGlobalKeys) {
      delete globalEnv[key]
    }

    for (const key of stubbedWindowKeys) {
      delete globalWindow[key]
    }

    for (const key of stubbedDocumentKeys) {
      delete globalDocument[key]
    }
  }
}

function tryGetAceGlobal(basePath: string) {
  // Work around an issue where using the @sanity/code-input plugin would crash
  // due to `ace` not being defined on the global due to odd bundling stategy.
  const acePath = resolveFrom.silent(basePath, 'ace-builds')
  if (!acePath) {
    return
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(acePath)
  } catch {
    return
  }
}

function getFileExtensions() {
  return [
    '.css',
    '.eot',
    '.gif',
    '.jpeg',
    '.jpg',
    '.otf',
    '.png',
    '.sass',
    '.scss',
    '.svg',
    '.ttf',
    '.webp',
    '.woff',
    '.woff2',
  ]
}
