import fs from 'node:fs'
import path from 'node:path'

import {type Plugin} from 'vite'

import {type GeneratedArtifact} from '../../artifact.js'
import {type ServiceArtifact, serviceArtifacts} from '../../services/artifact.js'
import {type InterfaceArtifact, viewArtifacts} from '../../views/artifact.js'
import {RUNTIME_DIR} from '../constants.js'

function relativeImport(fromFile: string, toFile: string): string {
  const rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

function writeArtifacts(root: string, artifacts: readonly GeneratedArtifact[]): void {
  for (const artifact of artifacts) {
    const artifactPath = path.resolve(root, RUNTIME_DIR, artifact.path)
    fs.mkdirSync(path.dirname(artifactPath), {recursive: true})
    fs.writeFileSync(
      artifactPath,
      artifact.source({
        resolveImport: (src) => relativeImport(artifactPath, path.resolve(root, src)),
      }),
    )
  }
}

/**
 * Emits one render-contract artifact per view component into
 * `RUNTIME_DIR/views/<view>/<component>.js`. The artifacts are exposed through
 * module federation (`./views/<view>/<component>`) by the `federation` plugin,
 * so the workbench host can load and render each component as its own island.
 * Each service likewise emits a self-contained worker bundle plus a loader
 * module under `RUNTIME_DIR/services/<name>/`, exposed as `./services/<name>`.
 *
 * The per-type knowledge lives in `views/artifact` and `services/artifact`;
 * this plugin only writes what those modules resolve.
 */
export function sanityExtensionArtifacts(options: {
  services?: readonly ServiceArtifact[]
  views: readonly InterfaceArtifact[]
}): Plugin {
  return {
    configResolved(config) {
      writeArtifacts(config.root, [
        ...viewArtifacts(options.views),
        ...serviceArtifacts(options.services ?? []),
      ])
    },
    name: 'sanity/extension-artifacts',
  }
}
