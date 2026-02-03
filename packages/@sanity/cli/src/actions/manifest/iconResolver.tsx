import DOMPurify from 'isomorphic-dompurify'
import {renderToReadableStream} from 'react-dom/server'

import {config} from './purifyConfig.js'
import {SchemaIcon, type SchemaIconProps} from './SchemaIcon.js'

/**
 * Resolves an icon to a sanitized HTML string.
 * Uses react-dom/server to capture styles during SSR.
 */
export const resolveIcon = async (props: SchemaIconProps): Promise<string | null> => {
  try {
    const stream = await renderToReadableStream(<SchemaIcon {...props} />)

    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks))
    return DOMPurify.sanitize(html.trim(), config)
  } catch {
    return null
  }
}
