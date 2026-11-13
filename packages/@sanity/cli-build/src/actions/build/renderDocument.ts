import {existsSync} from 'node:fs'
import path from 'node:path'

import {ux} from '@oclif/core'
import {tsxWorkerTask} from '@sanity/cli-core/tasks'

import {buildDebug} from './buildDebug.js'
import {getPossibleDocumentComponentLocations} from './getPossibleDocumentComponentLocations.js'

interface DocumentProps {
  basePath: string

  css?: string[]
  entryPath?: string
  title?: string
}

interface RenderDocumentOptions {
  studioRootPath: string

  autoUpdatesCssUrls?: string[]
  /**
   * Whether to load a custom `_document.js`/`_document.tsx` component from the
   * project root. Defaults to `true`. When `false`, the default document is
   * rendered and a warning is printed if such a file exists.
   */
  documentComponent?: boolean
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
  if (options.documentComponent === false) {
    warnAboutIgnoredDocumentComponents(options.studioRootPath)
  }

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

function warnAboutIgnoredDocumentComponents(studioRootPath: string): void {
  for (const location of getPossibleDocumentComponentLocations(studioRootPath)) {
    const warnKey = `ignored:${location}`
    if (hasWarnedAbout.has(warnKey) || !existsSync(location)) continue

    hasWarnedAbout.add(warnKey)
    ux.warn(
      `Ignoring ${path.relative(process.cwd(), location) || location}: custom document ` +
        'components are not loaded when `unstable_documentComponent` is `false`. To customize ' +
        'the HTML document, add a Vite plugin through the `vite` option in sanity.cli.ts.',
    )
  }
}
