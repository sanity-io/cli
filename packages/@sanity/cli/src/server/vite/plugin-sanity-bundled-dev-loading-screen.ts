import {type ServerResponse} from 'node:http'

import {type Plugin} from 'vite'

import {renderBundledDevLoadingScreen} from './bundledDevLoadingScreen.js'

/**
 * Global Vite sets on its bundled-dev fallback page ("Bundling in progress").
 * The HMR client uses it to decide whether a `full-reload { ifFallback }`
 * payload applies, and we use it to recognize the fallback response.
 */
const VITE_FALLBACK_MARKER = '__vite_is_fallback_page__'

/**
 * Matches complete inline script tags. The HMR implementation Vite inlines in
 * the fallback page has its own `</script>` occurrences escaped as `<\/script>`,
 * so a lazy match cannot end early inside it.
 */
const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script>/g

interface LoadingScreenPluginOptions {
  /** Project/studio title shown in the POST readout. */
  title?: string
}

/**
 * Replaces the default "Bundling in progress" page Vite serves while
 * `experimental.bundledDev` produces its first bundle with a Sanity-branded
 * BIOS/POST-style loading screen.
 *
 * Vite hardcodes that fallback HTML in its internal `indexHtmlMiddleware` and
 * exposes no option to customize it, so this plugin registers a middleware
 * ahead of Vite's internals (via `configureServer`) and rewrites the response
 * at `res.end` time. The fallback is recognized by Vite's own
 * `__vite_is_fallback_page__` marker, and the page's script tags — the marker
 * plus the inlined HMR client that auto-reloads once the bundle is ready — are
 * carried over verbatim, so reload behavior is untouched. If the response ever
 * stops looking like the known fallback shape, it passes through unmodified.
 */
export function sanityBundledDevLoadingScreenPlugin(
  options: LoadingScreenPluginOptions = {},
): Plugin {
  return {
    apply: 'serve',
    configureServer(server) {
      if (!server.config.experimental?.bundledDev) {
        return
      }

      server.middlewares.use((req, res, next) => {
        // Only document-style navigations can receive the fallback page
        // (mirrors the `sec-fetch-dest` values Vite's indexHtmlMiddleware
        // serves its fallback for).
        const dest = req.headers['sec-fetch-dest']
        if (
          dest !== undefined &&
          !['', 'document', 'fencedframe', 'frame', 'iframe'].includes(String(dest))
        ) {
          next()
          return
        }

        const originalEnd = res.end.bind(res) as ServerResponse['end']

        res.end = function end(
          chunk?: unknown,
          encodingOrCallback?: (() => void) | BufferEncoding,
          callback?: () => void,
        ) {
          const replaced = maybeRenderLoadingScreen(res, chunk, options.title)
          if (replaced === undefined) {
            return originalEnd(chunk as string, encodingOrCallback as BufferEncoding, callback)
          }
          const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback
          return originalEnd(replaced, 'utf8', cb)
        } as ServerResponse['end']

        next()
      })
    },
    name: 'sanity/server/bundled-dev-loading-screen',
  }
}

/**
 * Returns the custom loading screen HTML when `chunk` is Vite's bundled-dev
 * fallback page, or `undefined` when the response should pass through.
 */
function maybeRenderLoadingScreen(
  res: ServerResponse,
  chunk: unknown,
  title: string | undefined,
): string | undefined {
  if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) {
    return undefined
  }

  const contentType = res.getHeader('content-type')
  if (typeof contentType !== 'string' || !contentType.includes('text/html')) {
    return undefined
  }

  const html = chunk.toString()
  if (!html.includes(VITE_FALLBACK_MARKER)) {
    return undefined
  }

  const viteScripts = html.match(SCRIPT_TAG_RE)
  // The fallback page carries two scripts: the fallback marker and the inlined
  // HMR client. If that shape changes, serve Vite's page rather than risk
  // breaking the auto-reload contract.
  if (!viteScripts || viteScripts.length < 2) {
    return undefined
  }

  return renderBundledDevLoadingScreen({title, viteScripts: viteScripts.join('\n  ')})
}
