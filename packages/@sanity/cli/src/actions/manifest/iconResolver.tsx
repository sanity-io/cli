import {resolveLocalPackage} from '@sanity/cli-core'
import DOMPurify from 'isomorphic-dompurify'

import {manifestDebug} from './debug.js'
import {config} from './purifyConfig.js'
import {SchemaIcon, type SchemaIconProps} from './SchemaIcon.js'

/**
 * Resolves an icon to a sanitized HTML string.
 * Uses react-dom/server to capture styles during SSR.
 *
 * react-dom/server is resolved from the studio's working directory to ensure
 * the same React instance is used by both the server renderer and the studio's
 * components. Using the CLI's own react-dom/server would cause a dual-React
 * instance problem where the dispatcher set by one instance is invisible to the other.
 */
export const resolveIcon = async (props: SchemaIconProps): Promise<string | null> => {
  try {
    const {renderToReadableStream} = await resolveLocalPackage<typeof import('react-dom/server')>(
      'react-dom/server',
      props.workDir,
    )
    const stream = await renderToReadableStream(<SchemaIcon {...props} />)
    await stream.allReady

    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks))
    return DOMPurify.sanitize(html.trim(), config)
  } catch (error) {
    manifestDebug('Error resolving icon', error)
    return null
  }
}
