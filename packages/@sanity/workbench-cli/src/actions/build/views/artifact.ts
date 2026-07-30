import {type InterfaceType, VIEW_COMPONENTS, VIEW_CONTRACT_VERSION} from '../../../contract.js'
import {GENERATED_DOCK_ITEM_FILE} from '../../../resolveViews.js'
import {type GeneratedArtifact} from '../artifact.js'
import {renderRemote} from '../render-remote.js'

/** Subdirectory under the federation runtime dir where view artifacts are written. */
const VIEWS_DIR_NAME = 'views'

/**
 * An interface to generate render artifacts for. The `src` file default-exports
 * an `unstable_defineView(...)` result; the build emits one render-contract
 * artifact per component the interface type exposes.
 * @internal
 */
export interface InterfaceArtifact {
  /** Interface name, unique within the app. */
  name: string
  /** Path to the interface `src` file, relative to the app root (or absolute). */
  src: string
  /** Interface type — selects which components the build expands. */
  type: InterfaceType

  /** The build writes this view's `src` too — see {@link GENERATED_DOCK_ITEM}. */
  generated?: boolean
}

/**
 * The `src` of a dock item the app placed but didn't author: an inlined
 * `unstable_defineView('dock_item', ...)` that renders the host's default, so the
 * dock item stays the workbench's to change and never enters the app's bundle.
 * Renders nothing against a host that offers no default.
 */
const GENERATED_DOCK_ITEM: GeneratedArtifact = {
  path: GENERATED_DOCK_ITEM_FILE,
  source: () => `// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
export default {
  components: (props) => props.renderDefault?.() ?? null,
  type: 'dock_item',
  version: ${VIEW_CONTRACT_VERSION},
}
`,
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
    if (view.generated) artifacts.push(GENERATED_DOCK_ITEM)
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
