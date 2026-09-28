import fs from 'node:fs'
import path from 'node:path'

import {type EnvironmentModuleNode, type Plugin} from 'vite'

import {renderRemote} from '../../render-remote.js'
import {
  RESOURCE_BINDINGS_ENTRY_IMPORT,
  RESOURCE_BINDINGS_FILENAME,
  RESOURCE_BINDINGS_MODULE_SOURCE,
} from '../../resource-bindings.js'
import {FEDERATION_FILE_NAME, RUNTIME_DIR} from '../constants.js'
import {getFederationApi} from './plugin-module-federation.js'

const REMOTE_ENTRY_FILE = `${FEDERATION_FILE_NAME}.jsx`

// The studio wraps `Studio` with the user's config; HMR re-renders through the
// new module so a config edit takes effect. The `%RESOURCE_BINDINGS_IMPORT%`
// placeholder is filled in per-build (Blueprints only — see below).
const studioEntry = (isolateStyles: boolean) =>
  renderRemote({
    app: `(props) => React.createElement(Studio, { config, ...props })`,
    hmr: true,
    isolateStyles,
    preamble: `%RESOURCE_BINDINGS_IMPORT%import { Studio } from 'sanity'
import config from %STUDIO_CONFIG%`,
  })

// An SDK app's default export is the component; it Fast-Refreshes through its
// own dev server, so the wrapper needs no HMR boundary.
const appEntry = (isolateStyles: boolean) =>
  renderRemote({
    isolateStyles,
    preamble: `%RESOURCE_BINDINGS_IMPORT%import App from %APP_ENTRY%`,
  })

// A branded app that declares no `entry` (e.g. a dock-only panel/worker app)
// has no navigable full-page view, so there's no `App` to import. The runtime
// still needs a valid module for the federation build input, but it exposes no
// `./App` (see `plugin.ts`) — its `render` is unreachable and throws if reached.
// It renders no React tree, so it carries no lifecycle controller: there is
// nothing to pause.
const HEADLESS_APP_ENTRY = `\
// This file is auto-generated on 'sanity dev'
// Modifications to this file are automatically discarded
// This application declares no app view (no \`entry\`): it isn't navigable as a
// full-page app, only its panels/web workers are exposed.
%RESOURCE_BINDINGS_IMPORT%export function render() {
  throw new Error('This application has no app view: it declares no \`entry\`.')
}
`

export type FederationRuntimeOptions =
  | {appEntry?: string; isApp: true; isBlueprints?: boolean}
  | {isApp: false; isBlueprints?: boolean; studioConfigPath: string}

function renderEntry(options: FederationRuntimeOptions, isolateStyles: boolean): string {
  const {isBlueprints} = options

  let content: string
  if (options.isApp) {
    content = options.appEntry
      ? appEntry(isolateStyles).replace(/%APP_ENTRY%/, JSON.stringify(options.appEntry))
      : HEADLESS_APP_ENTRY
  } else {
    content = studioEntry(isolateStyles).replace(
      /%STUDIO_CONFIG%/,
      JSON.stringify(options.studioConfigPath),
    )
  }

  // Blueprints only: the remote entry statically imports the resource-bindings
  // module first, so bindings evaluate before app code. Off Blueprints the
  // placeholder resolves to nothing and the module is neither imported nor
  // written below.
  return content.replace(
    /%RESOURCE_BINDINGS_IMPORT%/,
    isBlueprints ? `${RESOURCE_BINDINGS_ENTRY_IMPORT}\n` : '',
  )
}

export function sanityFederationRuntime(options: FederationRuntimeOptions): Plugin {
  const {isBlueprints} = options
  let entryFileAbsPath = ''

  return {
    configResolved(config) {
      const dir = path.resolve(config.root, RUNTIME_DIR)
      entryFileAbsPath = path.join(dir, REMOTE_ENTRY_FILE)

      fs.mkdirSync(dir, {recursive: true})
      const isolateStyles = getFederationApi(config.plugins)?.isolateStyles ?? false
      fs.writeFileSync(entryFileAbsPath, renderEntry(options, isolateStyles))

      if (isBlueprints) {
        // Brett bakes the resolved values into this module at deploy.
        fs.writeFileSync(
          path.join(dir, RESOURCE_BINDINGS_FILENAME),
          RESOURCE_BINDINGS_MODULE_SOURCE,
        )
      }
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
