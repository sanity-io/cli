import {type MessagePort, parentPort, workerData} from 'node:worker_threads'

import {getDocumentHtml} from './renderDocumentWorker/getDocumentHtml.jsx'
import {type DocumentProps} from './renderDocumentWorker/types.js'

interface RenderDocumentOptions {
  studioRootPath: string

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
async function renderDocument(parent: MessagePort, options: RenderDocumentOptions) {
  const {importMap, isApp, props, studioRootPath} = options

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

  const html = await getDocumentHtml(parent, studioRootPath, props, importMap, isApp)

  parent.postMessage({
    html,
    type: 'result',
  })
}

// If we're not in a worker thread, throw an error
if (!parentPort || !workerData) {
  throw new Error('Must be used as a Worker with a valid options object in worker data')
}

await renderDocument(parentPort, workerData)
