import path from 'node:path'

import {type PreviewServerOptions, startPreviewServer} from '../../server.js'
import type {CliCommandArguments, CliCommandContext, CliConfig} from '../../types.js'
import {getSharedServerConfig, gracefulServerDeath} from '../../util/servers.js'

export interface StartPreviewServerCommandFlags {
  host?: string
  port?: string
}

export default async function startSanityPreviewServer(
  args: CliCommandArguments<StartPreviewServerCommandFlags>,
  context: CliCommandContext,
): Promise<void> {
  const flags = args.extOptions
  const {workDir, cliConfig} = context

  const defaultRootDir = path.resolve(path.join(workDir, 'dist'))
  const rootDir = path.resolve(args.argsWithoutOptions[0] || defaultRootDir)
  const config = getPreviewServerConfig({flags, workDir, cliConfig, rootDir})

  try {
    await startPreviewServer(config)
  } catch (err) {
    gracefulServerDeath('preview', config.httpHost, config.httpPort, err)
  }
}

function getPreviewServerConfig({
  flags,
  workDir,
  cliConfig,
  rootDir,
}: {
  flags: StartPreviewServerCommandFlags
  rootDir: string
  workDir: string
  cliConfig?: CliConfig
}): PreviewServerOptions {
  const baseConfig = getSharedServerConfig({flags, workDir, cliConfig})
  return {
    ...baseConfig,
    root: rootDir,
  }
}
