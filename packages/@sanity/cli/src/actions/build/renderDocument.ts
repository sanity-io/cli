import path, {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

import chalk from 'chalk'

import {tsxWorkerTask} from '../../loaders/tsx/tsxWorkerTask.js'
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
  const filename = fileURLToPath(import.meta.url)
  const dir = dirname(fileURLToPath(import.meta.url))

  buildDebug('Starting worker thread for %s', filename)
  try {
    const msg = await tsxWorkerTask<RenderDocumentWorkerResult>(
      path.resolve(`${dir}/renderDocument.worker.ts`),
      {
        name: 'renderDocument',
        rootPath: dir,
        workerData: {...options, dev: globalThis.__DEV__, shouldWarn: true},
      },
    )

    if (msg.type === 'warning') {
      if (msg.warnKey && hasWarnedAbout.has(msg.warnKey)) {
        return ''
      }

      if (Array.isArray(msg.message)) {
        for (const warning of msg.message) {
          console.warn(`${chalk.yellow('[warn]')} ${warning}`)
        }
      } else {
        console.warn(`${chalk.yellow('[warn]')} ${msg.message}`)
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
  } catch (err) {
    buildDebug('Worker errored: %s', err.message)
    throw err
  }
}
