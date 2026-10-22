'use strict'

const {join} = require('node:path')
const {pathToFileURL} = require('node:url')

const pluginUrl = pathToFileURL(join(__dirname, 'dist', 'typescriptPlugin.js')).href

/** @type {Promise<typeof import('./dist/typescriptPlugin.js')> | undefined} */
let loaded

function load() {
  loaded ??= import(pluginUrl)
  return loaded
}

/**
 * A `{path, schema}` entry of the plugin's `resources` config. Malformed entries are dropped.
 * @param {unknown} value
 * @returns {value is {path: string | string[]; schema: string}}
 */
function isResource(value) {
  if (typeof value !== 'object' || value === null) return false
  const {path, schema} = /** @type {{path?: unknown; schema?: unknown}} */ (value)
  const pathOk =
    typeof path === 'string' ||
    (Array.isArray(path) && path.length > 0 && path.every((item) => typeof item === 'string'))
  return pathOk && typeof schema === 'string'
}

/**
 * TypeScript loads language service plugins with require(), so this CommonJS
 * shim imports the ESM build. tsserver calls `create` once per project, and
 * each project gets its own watcher session that ends with its language service.
 * @param {unknown} _modules
 */
function init(_modules) {
  return {
    create(info) {
      const directory = info.project.getCurrentDirectory()
      const config = info.config || {}
      const schema = typeof config.schema === 'string' ? config.schema : undefined
      const resources = Array.isArray(config.resources)
        ? config.resources.filter(isResource)
        : undefined
      const serviceLogger = info.project.projectService && info.project.projectService.logger
      const log = (message) => {
        if (serviceLogger) serviceLogger.info(`@sanity/groq-files: ${message}`)
      }

      /** @type {{close(): void} | undefined} */
      let session
      let closed = false
      const close = () => {
        closed = true
        if (session) session.close()
        session = undefined
      }

      void load()
        .then((mod) => {
          if (closed) return
          session = mod.startGroqTypeScriptPlugin({
            directory,
            logger: {error: log},
            resources,
            schemaPath: schema,
          })
        })
        .catch((error) => {
          log(error instanceof Error ? error.message : String(error))
        })

      const service = info.languageService
      const proxy = Object.create(null)
      for (const key of Object.keys(service)) {
        const member = service[key]
        proxy[key] =
          typeof member === 'function' ? (...args) => member.apply(service, args) : member
      }
      proxy.dispose = () => {
        close()
        if (typeof service.dispose === 'function') service.dispose()
      }
      return proxy
    },
  }
}

module.exports = init
