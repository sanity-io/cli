import {parse as parseHtml} from 'node-html-parser'

/**
 * Adds `<link rel="preconnect">` hints for the API origin to the document
 * `<head>`, so DNS, TCP and TLS are done before the Studio's first `/users/me`
 * request.
 *
 * Browsers keep separate connection pools for credentialed and anonymous CORS
 * requests, and the Studio makes both: cookie auth sends credentials, token auth
 * sends an `Authorization` header without them. A single hint only warms one of
 * the two, so the origin gets one of each, plus `dns-prefetch` for browsers that
 * don't support `preconnect`.
 *
 * @internal
 */
export function addApiPreconnectLinksToHtml(html: string, origin?: string): string {
  if (!origin) return html

  const root = parseHtml(html)
  const headEl = root.querySelector('head')
  if (!headEl) return html

  const links = [
    `<link rel="preconnect" href="${origin}" crossorigin>`,
    `<link rel="preconnect" href="${origin}" crossorigin="use-credentials">`,
    `<link rel="dns-prefetch" href="${origin}">`,
  ].join('')

  // Keep `<meta charset>` first so the encoding is still declared within the first 1024 bytes.
  const charsetEl = headEl.querySelector('meta[charset]')
  if (charsetEl) {
    charsetEl.insertAdjacentHTML('afterend', links)
  } else {
    headEl.insertAdjacentHTML('afterbegin', links)
  }

  return root.outerHTML
}
