import {workerData as _workerData, isMainThread, parentPort} from 'node:worker_threads'

import {extractCreateWorkspaceManifest} from '../actions/manifest/extractWorkspaceManifest'
import {getStudioWorkspaces} from '../util/getStudioWorkspaces'
import {mockBrowserEnvironment} from '../util/mockBrowserEnvironment'

/** @internal */
export interface ExtractManifestWorkerData {
  workDir: string
}

async function main() {
  if (isMainThread || !parentPort) {
    throw new Error('This module must be run as a worker thread')
  }

  const opts = _workerData as ExtractManifestWorkerData

  const cleanup = mockBrowserEnvironment(opts.workDir)

  try {
    const workspaces = await getStudioWorkspaces({basePath: opts.workDir})

    for (const workspace of workspaces) {
      parentPort?.postMessage(extractCreateWorkspaceManifest(workspace))
    }
  } finally {
    parentPort?.close()
    cleanup()
  }
}

await main()
process.exit()
