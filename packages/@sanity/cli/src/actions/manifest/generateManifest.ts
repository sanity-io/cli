import {findProjectRoot, getGlobalCliClient, studioWorkerTask} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {type ClientConfig} from '@sanity/client'
import {type StudioManifest} from 'sanity'

import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {manifestDebug} from './debug.js'
import {type GenerateManifestWorkerData} from './types.js'

interface GenerateManifestWorkerSuccess {
  /** The final studio manifest for deployment registration */
  studioManifest: StudioManifest | undefined
  type: 'success'
}

/** @internal */
interface GenerateManifestWorkerError {
  message: string
  type: 'error'

  workspaceName?: string
}

type GenerateManifestWorkerMessage = GenerateManifestWorkerError | GenerateManifestWorkerSuccess

export async function generateManifest(): Promise<StudioManifest | undefined> {
  const projectRoot = await findProjectRoot(process.cwd())

  manifestDebug('Project root %o', projectRoot)

  const workDir = projectRoot.directory
  const configPath = projectRoot.path

  const apiClient = await getGlobalCliClient({
    apiVersion: 'v2024-08-01',
    requireUser: true,
  })

  const clientConfig: ClientConfig = {
    ...apiClient.config(),
    ignoreBrowserTokenWarning: true,
    requester: undefined,
  }

  const sanityVersion = await getLocalPackageVersion('sanity', workDir)

  if (!sanityVersion) {
    throw new Error('Could not determine installed sanity version')
  }

  const spin = spinner('Generating manifest').start()

  try {
    const result = await studioWorkerTask<GenerateManifestWorkerMessage>(
      new URL('generateManifest.worker.js', import.meta.url),
      {
        name: 'generateManifest',
        studioRootPath: workDir,
        workerData: {
          clientConfig: structuredClone(clientConfig),
          configPath,
          sanityVersion,
          workDir,
        } satisfies GenerateManifestWorkerData,
      },
    )

    manifestDebug('Result %o', result)

    if (result.type === 'error') {
      throw new Error(result.message)
    }

    spin.succeed()
    return result.studioManifest
  } catch (err) {
    manifestDebug('Error generating manifest', err)
    spin.fail()

    throw err
  }
}
