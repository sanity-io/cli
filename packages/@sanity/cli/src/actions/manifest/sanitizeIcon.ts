import DOMPurify from 'isomorphic-dompurify'

import {config} from './purifyConfig.js'

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
