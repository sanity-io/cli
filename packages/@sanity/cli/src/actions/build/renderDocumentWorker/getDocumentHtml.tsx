import {type MessagePort} from 'node:worker_threads'

import {renderToStaticMarkup} from 'react-dom/server'

import {buildDebug} from '../buildDebug.js'
import {addTimestampedImportMapScriptToHtml} from './addTimestampImportMapScriptToHtml.js'
import {getDocumentComponent} from './getDocumentComponent.js'
import {type DocumentProps} from './types.js'

/**
 * Adds a base path to a URL if necessary, and returns the resulting URL.
 * @param url - The URL to prefix with a base path.
 * @param basePath - The base path to prefix the URL with. Default value is `/`.
 * @returns The resulting URL with the base path.
 * @internal
 */
function _prefixUrlWithBasePath(url: string, basePath: string): string {
  // Normalize basePath by adding a leading slash if it's missing.
  const normalizedBasePath = basePath.startsWith('/') ? basePath : `/${basePath}`

  // If the URL starts with a slash, append it to the basePath, removing any trailing slash if present.
  if (url.startsWith('/')) {
    if (normalizedBasePath.endsWith('/')) {
      return `${normalizedBasePath.slice(0, -1)}${url}`
    }
    return `${normalizedBasePath}${url}`
  }

  // If the URL doesn't start with a slash, append it to the basePath with a slash in between.
  if (normalizedBasePath.endsWith('/')) {
    return `${normalizedBasePath}${url}`
  }
  return `${normalizedBasePath}/${url}`
}

/**
 * @internal
 */
export async function getDocumentHtml(
  parent: MessagePort,
  studioRootPath: string,
  props?: DocumentProps,
  importMap?: {imports?: Record<string, string>},
  isApp?: boolean,
  autoUpdatesCssUrls?: string[],
): Promise<string> {
  const Document = await getDocumentComponent(parent, studioRootPath, isApp)

  const defaultProps = {
    entryPath: './.sanity/runtime/app.js',
  }

  // NOTE: Validate the list of CSS paths so implementers of `_document.tsx` don't have to
  // - If the path is not a full URL, check if it starts with `/`
  //   - If not, then prepend a `/` to the string
  const css = props?.css?.map((url) => {
    try {
      // If the URL is absolute, we don't need to prefix it
      return new URL(url).toString()
    } catch {
      return _prefixUrlWithBasePath(url, props.basePath)
    }
  })

  buildDebug('Rendering document component using React')
  const result = addTimestampedImportMapScriptToHtml(
    renderToStaticMarkup(<Document {...defaultProps} {...props} css={css} />),
    importMap,
    autoUpdatesCssUrls,
  )

  return `<!DOCTYPE html>${result}`
}
