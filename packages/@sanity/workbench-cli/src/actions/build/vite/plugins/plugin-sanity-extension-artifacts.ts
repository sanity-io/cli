import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {type Plugin} from 'vite'

import {type GeneratedArtifact} from '../../artifact.js'
import {WORKER_BUS_ENTRY} from '../../services/artifact.js'
import {RUNTIME_DIR} from '../constants.js'
import {getFederationApi} from './plugin-module-federation.js'

const workerBusPath = fileURLToPath(
  new URL('../../../../_exports/_internal_worker_bus.js', import.meta.url),
)

function relativeImport(fromFile: string, toFile: string): string {
  const rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

function writeArtifacts({
  artifacts,
  isolateStyles,
  root,
}: {
  artifacts: readonly GeneratedArtifact[]
  isolateStyles: boolean
  root: string
}): void {
  for (const artifact of artifacts) {
    const artifactPath = path.resolve(root, RUNTIME_DIR, artifact.path)
    fs.mkdirSync(path.dirname(artifactPath), {recursive: true})
    fs.writeFileSync(
      artifactPath,
      artifact.source({
        isolateStyles,
        resolveImport: (src) => relativeImport(artifactPath, path.resolve(root, src)),
      }),
    )
  }
}

/**
 * Writes the federation runtime artifacts (view render-contract modules, service
 * worker bundles + loaders) into `RUNTIME_DIR`, resolving each artifact's import
 * paths relative to where it lands on disk. The set is expanded once by
 * `workbenchArtifacts` and handed in — this plugin only writes it.
 */
export function sanityExtensionArtifacts(options: {
  artifacts: readonly GeneratedArtifact[]
}): Plugin {
  return {
    // The generated worker.js imports the bus client from this package, which
    // the app has no dependency on and so can't resolve by name.
    config: () => ({
      optimizeDeps: {exclude: [WORKER_BUS_ENTRY]},
      resolve: {alias: {[WORKER_BUS_ENTRY]: workerBusPath}},
    }),
    configResolved(config) {
      writeArtifacts({
        artifacts: options.artifacts,
        isolateStyles: getFederationApi(config.plugins)?.isolateStyles ?? false,
        root: config.root,
      })
    },
    name: 'sanity/extension-artifacts',
  }
}
