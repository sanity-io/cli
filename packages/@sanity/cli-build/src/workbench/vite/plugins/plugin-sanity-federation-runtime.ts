import fs from 'node:fs'
import path from 'node:path'

import {type EnvironmentModuleNode, type Plugin} from 'vite'

import {renderRemote} from '../../render-remote.js'
import {FEDERATION_FILE_NAME, RUNTIME_DIR} from '../constants.js'

const REMOTE_ENTRY_FILE = `${FEDERATION_FILE_NAME}.jsx`

// The studio wraps `Studio` with the user's config; HMR re-renders through the
// new module so a config edit takes effect.
const STUDIO_ENTRY = renderRemote({
  app: `(props) => createElement(Studio, { config, ...props })`,
  hmr: true,
  preamble: `import { Studio } from 'sanity'
import config from %STUDIO_CONFIG%`,
})

// An SDK app's default export is the component; it Fast-Refreshes through its
// own dev server, so the wrapper needs no HMR boundary.
const APP_ENTRY = renderRemote({preamble: `import App from %APP_ENTRY%`})

// A branded app that declares no `entry` (e.g. a dock-only panel/worker app)
// has no navigable full-page view, so there's no `App` to import. The runtime
// still needs a valid module for the federation build input, but it exposes no
// `./App` (see `plugin.ts`) — its `render` is unreachable and throws if reached.
const HEADLESS_APP_ENTRY = `\
// This file is auto-generated on 'sanity dev'
// Modifications to this file are automatically discarded
// This application declares no app view (no \`entry\`): it isn't navigable as a
// full-page app, only its panels/services are exposed.
export function render() {
  throw new Error('This application has no app view: it declares no \`entry\`.')
}
`

export type FederationRuntimeOptions =
  | {appEntry?: string; isApp: true}
  | {isApp: false; studioConfigPath: string}

export function sanityFederationRuntime(options: FederationRuntimeOptions): Plugin {
  let content: string
  if (options.isApp) {
    content = options.appEntry
      ? APP_ENTRY.replace(/%APP_ENTRY%/, JSON.stringify(options.appEntry))
      : HEADLESS_APP_ENTRY
  } else {
    content = STUDIO_ENTRY.replace(/%STUDIO_CONFIG%/, JSON.stringify(options.studioConfigPath))
  }

  let entryFileAbsPath = ''

  return {
    configResolved(config) {
      const dir = path.resolve(config.root, RUNTIME_DIR)
      entryFileAbsPath = path.join(dir, REMOTE_ENTRY_FILE)

      fs.mkdirSync(dir, {recursive: true})
      fs.writeFileSync(entryFileAbsPath, content)
    },
    hotUpdate({file, modules, timestamp}) {
      if (options.isApp) return
      if (this.environment.name !== 'client') return

      const {moduleGraph} = this.environment
      const studioMods = moduleGraph.getModulesByFile(entryFileAbsPath)
      if (!studioMods?.size) return

      // Is the changed file reachable from the studio entry?
      const visited = new Set<EnvironmentModuleNode>()
      const queue: EnvironmentModuleNode[] = [...studioMods]
      while (queue.length > 0) {
        const mod = queue.pop()!
        if (visited.has(mod)) continue
        visited.add(mod)
        if (mod.file === file) {
          // The walk from `file` up through importers dead-ends at federation
          // gaps, so invalidate changed modules ourselves and route HMR to the
          // self-accepting studio entry.
          const seen = new Set<EnvironmentModuleNode>()
          for (const m of modules) {
            moduleGraph.invalidateModule(m, seen, timestamp, true)
          }
          return [...studioMods]
        }
        for (const dep of mod.importedModules) queue.push(dep)
      }
    },
    name: 'sanity/federation-runtime',
  }
}
