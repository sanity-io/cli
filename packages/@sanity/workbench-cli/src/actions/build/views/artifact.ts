import {type InterfaceType, VIEW_COMPONENTS} from '../../../contract.js'
import {type GeneratedArtifact} from '../artifact.js'
import {renderRemote} from '../render-remote.js'

/** Subdirectory under the federation runtime dir where view artifacts are written. */
const VIEWS_DIR_NAME = 'views'

/**
 * An interface to generate render artifacts for. The `src` file default-exports
 * an `unstable_defineView(...)` result; the build emits one render-contract
 * artifact per component the interface type exposes.
 * @public
 */
export interface InterfaceArtifact {
  /** Interface name, unique within the app. */
  name: string
  /** Path to the interface `src` file, relative to the app root (or absolute). */
  src: string
  /** Interface type — selects which components the build expands. */
  type: InterfaceType
}

/**
 * Expand each view into one generated artifact per component it exposes. A
 * panel's `title` and `panel` each become their own render-contract module and
 * module-federation expose, so the host renders each as an independent island.
 *
 * Each artifact binds its component as the `App` the render contract renders —
 * a single-component view exports a bare function, a multi-component one keys by
 * name — behind an HMR boundary so view edits re-render through the new module.
 */
export function viewArtifacts(views: readonly InterfaceArtifact[]): GeneratedArtifact[] {
  const artifacts: GeneratedArtifact[] = []
  for (const view of views) {
    for (const component of VIEW_COMPONENTS[view.type]) {
      artifacts.push({
        expose: `./${VIEWS_DIR_NAME}/${view.name}/${component}`,
        path: `${VIEWS_DIR_NAME}/${view.name}/${component}.js`,
        source: ({resolveImport}) =>
          renderRemote({
            app: `typeof view.components === 'function' ? view.components : view.components[${JSON.stringify(component)}]`,
            hmr: true,
            preamble: `import view from ${JSON.stringify(resolveImport(view.src))}`,
            version: `view.version`,
          }),
      })
    }
  }
  return artifacts
}
