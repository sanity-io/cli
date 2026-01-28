import {type CliConfig} from '@sanity/cli-core'

import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {startPreviewServer} from '../../server/previewServer.js'
import {getPreviewServerConfig} from './getPreviewServerConfig.js'
import {type PreviewFlags} from './types.js'

interface PreviewActionOptions {
  cliConfig: CliConfig
  flags: PreviewFlags
  outDir: string
  workDir: string
}

export async function previewAction(options: PreviewActionOptions) {
  const {cliConfig, flags, outDir, workDir} = options

  const config = getPreviewServerConfig({cliConfig, flags, rootDir: outDir, workDir})

  try {
    const server = await startPreviewServer(config)
    return server
  } catch (err) {
    throw gracefulServerDeath('preview', config.httpHost, config.httpPort, err)
  }
}
