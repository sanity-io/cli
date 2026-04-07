import {type MessagePort} from 'node:worker_threads'

import {getDocumentHtml} from './getDocumentHtml.js'
import {type DocumentProps} from './types.js'

/**
 * @internal
 */
export interface RenderDocumentWorkerOptions {
  studioRootPath: string

  autoUpdatesCssUrls?: string[]
  importMap?: {
    imports?: Record<string, string>
  }
  isApp?: boolean
  props?: DocumentProps
}

/**
 * Renders a document in a worker thread
 *
 * @param parent - The parent port to send messages to
 * @param options - The options for the document to render
 * @returns - The rendered document
 */
export async function renderDocumentWorker(
  parent: MessagePort,
  options: RenderDocumentWorkerOptions,
) {
  const {autoUpdatesCssUrls, importMap, isApp, props, studioRootPath} = options

  if (typeof studioRootPath !== 'string') {
    parent.postMessage({
      message: 'Missing/invalid `studioRootPath` option',
      type: 'error',
    })
    return
  }

  if (props && typeof props !== 'object') {
    parent.postMessage({
      message: '`props` must be an object if provided',
      type: 'error',
    })
    return
  }

  const html = await getDocumentHtml(parent, studioRootPath, props, importMap, isApp, autoUpdatesCssUrls)

  parent.postMessage({
    html,
    type: 'result',
  })
}
