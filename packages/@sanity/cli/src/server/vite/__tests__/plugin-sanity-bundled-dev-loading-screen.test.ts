import {type IncomingMessage, type ServerResponse} from 'node:http'

import {type Connect, type ViteDevServer} from 'vite'
import {describe, expect, it, vi} from 'vitest'

import {renderBundledDevLoadingScreen} from '../bundledDevLoadingScreen.js'
import {sanityBundledDevLoadingScreenPlugin} from '../plugin-sanity-bundled-dev-loading-screen.js'

/**
 * Mirrors the shape of the fallback HTML Vite generates in
 * `generateFallbackHtml` for `experimental.bundledDev`: a marker script, an
 * inlined HMR client (with escaped `<\/script>` occurrences), a style block,
 * and the "Bundling in progress" body.
 */
const VITE_FALLBACK_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <script>globalThis.__vite_is_fallback_page__ = true</script>
  <script type="module">
    // inlined vite HMR client
    const template = "<\\/script>"
    connectToHmrServer()
  </script>
  <style>
    body { background-color: #1e1e1e; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Bundling in progress</h1>
    <p>The page will automatically reload when ready.</p>
    <div class="spinner"></div>
  </div>
</body>
</html>
`

function createMiddleware(options?: {
  bundledDev?: boolean
  title?: string
}): Connect.NextHandleFunction | undefined {
  const {bundledDev = true, title} = options ?? {}
  const plugin = sanityBundledDevLoadingScreenPlugin({title})

  let middleware: Connect.NextHandleFunction | undefined
  const server = {
    config: {experimental: {bundledDev}},
    middlewares: {
      use: vi.fn((handler: Connect.NextHandleFunction) => {
        middleware = handler
      }),
    },
  } as unknown as ViteDevServer

  const configureServer = plugin.configureServer
  if (typeof configureServer !== 'function') {
    throw new TypeError('expected configureServer to be a function')
  }
  configureServer.call(
    // The plugin does not use the hook context.
    undefined as never,
    server,
  )
  return middleware
}

function createRequest(headers: Record<string, string> = {}): IncomingMessage {
  return {headers, method: 'GET', url: '/'} as unknown as IncomingMessage
}

/** Pass `contentType: null` to simulate a response without the header. */
function createResponse(contentType: string | null = 'text/html') {
  const end = vi.fn()
  const res = {
    end,
    getHeader: (name: string) =>
      name.toLowerCase() === 'content-type' && contentType !== null ? contentType : undefined,
  } as unknown as ServerResponse
  return {end, res}
}

/** Runs the middleware, then simulates a downstream `res.end(chunk)`. */
function serve(
  middleware: Connect.NextHandleFunction,
  chunk: unknown,
  {
    contentType = 'text/html',
    headers = {},
  }: {contentType?: string | null; headers?: Record<string, string>} = {},
): {body: unknown; end: ReturnType<typeof vi.fn>} {
  const req = createRequest(headers)
  const {end, res} = createResponse(contentType)
  const next = vi.fn()
  middleware(req, res, next)
  expect(next).toHaveBeenCalledOnce()
  res.end(chunk as never)
  return {body: end.mock.calls[0]?.[0], end}
}

describe('sanityBundledDevLoadingScreenPlugin', () => {
  it('does not register a middleware when bundled dev mode is off', () => {
    expect(createMiddleware({bundledDev: false})).toBeUndefined()
  })

  it('registers a middleware when bundled dev mode is on', () => {
    expect(createMiddleware()).toBeTypeOf('function')
  })

  it('replaces the vite fallback page with the BIOS loading screen', () => {
    const middleware = createMiddleware({title: 'My Studio'})!
    const {body} = serve(middleware, VITE_FALLBACK_HTML)

    expect(body).toContain('SANITY DEV BIOS')
    expect(body).toContain('Mounting My Studio')
    expect(body).not.toContain('Bundling in progress')
  })

  it('preserves both vite scripts so auto-reload keeps working', () => {
    const middleware = createMiddleware()!
    const {body} = serve(middleware, VITE_FALLBACK_HTML)

    expect(body).toContain('globalThis.__vite_is_fallback_page__ = true')
    expect(body).toContain('connectToHmrServer()')
    // The escaped closing tag inside the HMR client must survive extraction.
    expect(body).toContain('const template = "<\\/script>"')
  })

  it('handles Buffer response chunks', () => {
    const middleware = createMiddleware()!
    const {body} = serve(middleware, Buffer.from(VITE_FALLBACK_HTML))

    expect(body).toContain('SANITY DEV BIOS')
  })

  it('passes through HTML without the fallback marker', () => {
    const middleware = createMiddleware()!
    const html = '<!DOCTYPE html><html><body>real app</body></html>'
    const {body} = serve(middleware, html)

    expect(body).toBe(html)
  })

  it('passes through non-HTML responses', () => {
    const middleware = createMiddleware()!
    const {body} = serve(middleware, VITE_FALLBACK_HTML, {contentType: 'application/json'})

    expect(body).toBe(VITE_FALLBACK_HTML)
  })

  it('passes through responses without a content-type header', () => {
    const middleware = createMiddleware()!
    const {body} = serve(middleware, VITE_FALLBACK_HTML, {contentType: null})

    expect(body).toBe(VITE_FALLBACK_HTML)
  })

  it('passes through res.end() calls without a body', () => {
    const middleware = createMiddleware()!
    const {body, end} = serve(middleware, undefined)

    expect(end).toHaveBeenCalledOnce()
    expect(body).toBeUndefined()
  })

  it('passes through when the fallback shape is missing the expected scripts', () => {
    const middleware = createMiddleware()!
    const html =
      '<html><head><script>globalThis.__vite_is_fallback_page__ = true</script></head></html>'
    const {body} = serve(middleware, html)

    expect(body).toBe(html)
  })

  it('does not intercept non-document requests', () => {
    const middleware = createMiddleware()!
    const {body} = serve(middleware, VITE_FALLBACK_HTML, {
      headers: {'sec-fetch-dest': 'script'},
    })

    expect(body).toBe(VITE_FALLBACK_HTML)
  })

  it('intercepts document navigations', () => {
    const middleware = createMiddleware()!
    const {body} = serve(middleware, VITE_FALLBACK_HTML, {
      headers: {'sec-fetch-dest': 'document'},
    })

    expect(body).toContain('SANITY DEV BIOS')
  })

  it('forwards the callback when replacing the response', () => {
    const middleware = createMiddleware()!
    const req = createRequest()
    const {end, res} = createResponse()
    const next = vi.fn()
    middleware(req, res, next)

    const callback = vi.fn()
    res.end(VITE_FALLBACK_HTML, callback)

    expect(end).toHaveBeenCalledOnce()
    expect(end.mock.calls[0][0]).toContain('SANITY DEV BIOS')
    expect(end.mock.calls[0][2]).toBe(callback)
  })
})

describe('renderBundledDevLoadingScreen', () => {
  const viteScripts = '<script>globalThis.__vite_is_fallback_page__ = true</script>'

  it('inlines the provided vite scripts in the head', () => {
    const html = renderBundledDevLoadingScreen({viteScripts})
    expect(html.indexOf(viteScripts)).toBeGreaterThan(-1)
    expect(html.indexOf(viteScripts)).toBeLessThan(html.indexOf('</head>'))
  })

  it('defaults the product name to Sanity Studio', () => {
    const html = renderBundledDevLoadingScreen({viteScripts})
    expect(html).toContain('Mounting Sanity Studio')
  })

  it('escapes HTML in the title', () => {
    const html = renderBundledDevLoadingScreen({
      title: '<img src=x onerror=alert(1)>',
      viteScripts,
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })

  it('truncates very long titles so the POST columns stay aligned', () => {
    const html = renderBundledDevLoadingScreen({
      title: 'An Extremely Long Studio Title That Would Break The Layout',
      viteScripts,
    })
    expect(html).toContain('…')
    expect(html).not.toContain('Break The Layout ')
  })

  it('mentions the auto-reload behavior', () => {
    const html = renderBundledDevLoadingScreen({viteScripts})
    expect(html).toMatch(/reload automatically/i)
  })

  it('has no external resource references', () => {
    const html = renderBundledDevLoadingScreen({viteScripts})
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/<link\b/)
  })
})
