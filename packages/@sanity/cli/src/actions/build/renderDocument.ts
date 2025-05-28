import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Worker} from 'node:worker_threads'

import chalk from 'chalk'

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

const __DEV__ = false

const hasWarnedAbout = new Set<string>()

export function renderDocument(options: RenderDocumentOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const filename = fileURLToPath(import.meta.url)
    const dir = dirname(fileURLToPath(import.meta.url))

    buildDebug('Starting worker thread for %s', filename)
    const worker = new Worker(filename, {
      env: process.env,
      execArgv: __DEV__ ? ['-r', `${dir}/esbuild-register.js`] : undefined,
      workerData: {...options, dev: __DEV__, shouldWarn: true},
    })

    worker.on('message', (msg) => {
      if (msg.type === 'warning') {
        if (hasWarnedAbout.has(msg.warnKey)) {
          return
        }

        if (Array.isArray(msg.message)) {
          for (const warning of msg.message) {
            console.warn(`${chalk.yellow('[warn]')} ${warning}`)
          }
        } else {
          console.warn(`${chalk.yellow('[warn]')} ${msg.message}`)
        }

        hasWarnedAbout.add(msg.warnKey)
        return
      }

      if (msg.type === 'error') {
        buildDebug('Error from worker: %s', msg.error || 'Unknown error')
        reject(new Error(msg.error || 'Document rendering worker stopped with an unknown error'))
        return
      }

      if (msg.type === 'result') {
        buildDebug('Document HTML rendered, %d bytes', msg.html.length)
        resolve(msg.html)
      }
    })
    worker.on('error', (err) => {
      buildDebug('Worker errored: %s', err.message)
      reject(err)
    })
    worker.on('exit', (code) => {
      if (code !== 0) {
        buildDebug('Worker stopped with code %d', code)
        reject(new Error(`Document rendering worker stopped with exit code ${code}`))
      }
    })
  })
}
