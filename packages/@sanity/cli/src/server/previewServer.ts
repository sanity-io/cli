import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import path from 'node:path'

import {type UserViteConfig} from '@sanity/cli-core'
import chalk from 'chalk'
import {type InlineConfig} from 'vite'

import {extendViteConfigWithUserConfig} from '../actions/build/getViteConfig.js'
import {serverDebug} from './serverDebug.js'
import {sanityBasePathRedirectPlugin} from './vite/plugin-sanity-basepath-redirect.js'

const require = createRequire(import.meta.url)
const {version} = require('vite/package.json')

const debug = serverDebug.extend('preview')

interface PreviewServer {
  close(): Promise<void>
  urls: {local: string[]; network: string[]}
}

interface PreviewServerOptions {
  cwd: string
  httpPort: number

  root: string

  workDir: string

  httpHost?: string
  isApp?: boolean
  vite?: UserViteConfig
}

export async function startPreviewServer(options: PreviewServerOptions): Promise<PreviewServer> {
  const {httpHost, httpPort, isApp, root, vite: extendViteConfig, workDir} = options
  const startTime = Date.now()

  const indexPath = path.join(root, 'index.html')
  let basePath: string | undefined
  try {
    const index = await readFile(indexPath, 'utf8')
    basePath = tryResolveBasePathFromIndex(index)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err
    }

    const error = new Error(
      `Could not find a production build in the '${root}' directory.\nTry building your ${isApp ? 'application' : 'studio'} with 'sanity build' before starting the preview server.`,
    )
    error.name = 'BUILD_NOT_FOUND'
    throw error
  }

  const mode = 'production'
  let previewConfig: InlineConfig = {
    base: basePath || '/',
    // Needed for vite to not serve `root/dist`
    build: {
      outDir: root,
    },
    configFile: false,
    mode,
    plugins: [sanityBasePathRedirectPlugin(basePath)],
    preview: {
      host: httpHost,
      port: httpPort,
      strictPort: true,
    },
    root: workDir,
  }

  // Extend Vite configuration with user-provided config
  if (extendViteConfig) {
    previewConfig = await extendViteConfigWithUserConfig(
      {command: 'serve', mode},
      previewConfig,
      extendViteConfig,
    )
  }

  debug('Creating vite server')
  const {preview} = await import('vite')
  const server = await preview(previewConfig)
  const warn = server.config.logger.warn
  const info = server.config.logger.info
  const url = server.resolvedUrls!.local[0]

  if (basePath === undefined) {
    warn('Could not determine base path from index.html, using "/" as default')
  } else if (basePath && basePath !== '/') {
    info(`Using resolved base path from static build: ${chalk.cyan(basePath)}`)
  }

  const startupDuration = Date.now() - startTime

  info(
    `Sanity ${isApp ? 'application' : 'Studio'} ` +
      `using ${chalk.cyan(`vite@${version}`)} ` +
      `ready in ${chalk.cyan(`${Math.ceil(startupDuration)}ms`)} ` +
      `and running at ${chalk.cyan(url)} (production preview mode)`,
  )

  return {
    close: () =>
      new Promise((resolve, reject) =>
        server.httpServer.close((err) => (err ? reject(err) : resolve())),
      ),
    urls: server.resolvedUrls!,
  }
}

function tryResolveBasePathFromIndex(index: string): string | undefined {
  // <script ... src="/some-base-path/static/sanity-a3cc3d86.js"></script>
  const basePath = index.match(/<script[^>]+src="(.*?)\/static\/sanity-/)?.[1]

  // We _expect_ to be able to find the base path. If we can't, we should warn.
  // Note that we're checking for `undefined` here, since an empty string is a
  // valid base path.
  if (basePath === undefined) {
    return undefined
  }

  // In the case of an empty base path, we still want to return `/` to indicate
  // that we _found_ the basepath - it just happens to be empty. Eg:
  // <script ... src = "/static/sanity-a3cc3d86.js"></script>
  // Which differs from not being able to find the script tag at all, in which
  // case we'll want to show a warning to indicate that it is an abnormality.
  return basePath === '' ? '/' : basePath
}
