import {type CliConfig} from '../../config/cli/types.js'
import {gracefulServerDeath} from '../../server/gracefulServerDeath.js'
import {startPreviewServer} from '../../server/previewServer.js'
import {getPreviewServerConfig} from './getPreviewServerConfig.js'
import {type StartFlags} from './types.js'

interface PreviewActionOptions {
  cliConfig: CliConfig
  flags: StartFlags
  outDir: string
  workDir: string
}

export async function previewAction(options: PreviewActionOptions) {
  const {cliConfig, flags, outDir, workDir} = options

  const config = getPreviewServerConfig({cliConfig, flags, rootDir: outDir, workDir})

  try {
    await startPreviewServer(config)
  } catch (err) {
    gracefulServerDeath('preview', config.httpHost, config.httpPort, err)
  }
}
