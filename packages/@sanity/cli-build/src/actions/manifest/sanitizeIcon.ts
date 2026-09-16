import createDOMPurify from 'dompurify'
import {JSDOM} from 'jsdom'

import {config} from './purifyConfig.js'

const {window} = new JSDOM('<!DOCTYPE html>')
const DOMPurify = createDOMPurify(window)

/**
 * Sanitize icon markup against the manifest allowlist (see {@link config}).
 *
 * Shared by the studio manifest icon resolver and the core app manifest so
 * every icon we inline — whether rendered from a React component or read from
 * a file on disk — passes through the exact same trusted subset of SVG/HTML.
 */
export function sanitizeIcon(html: string): string {
  return DOMPurify.sanitize(html.trim(), config)
}
