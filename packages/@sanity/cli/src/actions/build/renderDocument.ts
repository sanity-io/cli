import {ux} from '@oclif/core'
import {tsxWorkerTask} from '@sanity/cli-core'

import {buildDebug} from './buildDebug.js'

interface DocumentProps {
  basePath: string

  css?: string[]
  entryPath?: string
}

interface RenderDocumentOptions {
  studioRootPath: string

  importMap?: {
    imports?: Record<string, string>
  }
  isApp?: boolean
  props?: DocumentProps
}

const hasWarnedAbout = new Set<string>()

interface RenderDocumentWorkerResult {
  type: 'error' | 'result' | 'warning'

  html?: string
  message?: string | string[]
  warnKey?: string
}

export async function renderDocument(options: RenderDocumentOptions): Promise<string> {
  buildDebug('Starting worker thread for %s', import.meta.url)
  try {
    const msg = await tsxWorkerTask<RenderDocumentWorkerResult>(
      new URL(`renderDocument.worker.js`, import.meta.url),
      {
        name: 'renderDocument',
        rootPath: options.studioRootPath,
        workerData: {...options, shouldWarn: true},
      },
    )

    if (msg.type === 'warning') {
      if (msg.warnKey && hasWarnedAbout.has(msg.warnKey)) {
        return ''
      }

      if (Array.isArray(msg.message)) {
        for (const warning of msg.message) {
          ux.warn(warning)
        }
      } else if (msg.message) {
        ux.warn(msg.message)
      }

      if (msg.warnKey) {
        hasWarnedAbout.add(msg.warnKey)
      }
      return ''
    }

    if (msg.type === 'error') {
      buildDebug('Error from worker: %s', msg.message || 'Unknown error')
      throw new Error(
        Array.isArray(msg.message)
          ? msg.message.join('\n')
          : msg.message || 'Document rendering worker stopped with an unknown error',
      )
    }

    if (msg.type === 'result') {
      if (!msg.html) {
        throw new Error('Document rendering worker stopped with an unknown error')
      }

      buildDebug('Document HTML rendered, %d bytes', msg.html.length)
      return msg.html
    }

    throw new Error('Unknown message type')
  } catch (err) {
    buildDebug('Worker errored: %s', err.message)
    throw err
  }
}
