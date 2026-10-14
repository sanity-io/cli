import {createRequire} from 'node:module'
import path from 'node:path'

import {type PluginOption} from 'vite'

const EMPTY_CSS_ID = '\0sanity/stub-ui5-stylesheet:empty.css'
const UI5_PATH_SEGMENT = /[\\/]ui5[\\/](?:dist[\\/])?styles\.css$/

/**
 * Stubs `ui5/styles.css` (side-effect-imported by the `sanity` root barrel)
 * to an empty module in Media Library config app builds: its global reset
 * strips padding across the host page the island renders into, and nothing
 * in an island uses ui5. The barrel's other stylesheets are scoped class
 * names and left alone.
 *
 * Recognized three ways because the specifier shape differs per pipeline
 * stage: the bare specifier (build), the resolved file path (dev serves the
 * CSS by `/@fs/` path, which under pnpm never says `ui5` — hence resolving
 * the package dir and prefix-matching), and an `/ui5/` path segment
 * (npm/yarn layouts).
 */
export function stubUi5Stylesheet(appRoot: string): PluginOption {
  let ui5PackageDir: string | null = null
  try {
    const requireFromApp = createRequire(path.join(appRoot, 'package.json'))
    const requireFromSanity = createRequire(requireFromApp.resolve('sanity/package.json'))
    ui5PackageDir = path.dirname(requireFromSanity.resolve('ui5/package.json'))
  } catch {
    // No ui5 dep on this sanity version — nothing to stub, patterns still apply.
  }
  const isUi5Stylesheet = (source: string): boolean => {
    if (source === 'ui5/styles.css') return true
    if (!source.split('?', 1)[0].endsWith('.css')) return false
    const [fsPath] = source.split('?', 1)
    const normalized = fsPath.startsWith('/@fs/') ? fsPath.slice('/@fs'.length) : fsPath
    return (
      (ui5PackageDir !== null && normalized.startsWith(`${ui5PackageDir}${path.sep}`)) ||
      UI5_PATH_SEGMENT.test(normalized)
    )
  }
  return {
    enforce: 'pre',
    load(id) {
      return id === EMPTY_CSS_ID ? '' : null
    },
    name: 'sanity/stub-ui5-stylesheet',
    resolveId(source) {
      return isUi5Stylesheet(source) ? EMPTY_CSS_ID : null
    },
  }
}
