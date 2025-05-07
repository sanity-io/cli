import {Command} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import open from 'open'

import {getCliConfig} from '../config/cli/getCliConfig.js'
import {findProjectRoot} from '../config/findProjectRoot.js'
import {getStudioConfig} from '../config/studio/getStudioConfig.js'

export default class ManageCommand extends Command {
  static override description = 'Opens project management interface in your web browser'
  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(ManageCommand)

    const projectId = await findProjectId()

    const url = projectId
      ? `https://www.sanity.io/manage/project/${projectId}`
      : 'https://www.sanity.io/manage/'

    this.log(`Opening ${url}`)
    await open(url)
  }
}

async function findProjectId() {
  const root = await findProjectRoot(process.cwd())
  if (!root) {
    return null
  }

  const cliConfig = await getCliConfig(root.directory)
  if (cliConfig.api?.projectId) {
    return cliConfig.api.projectId
  }

  const config = await getStudioConfig(root.directory, {resolvePlugins: false})
  if (!Array.isArray(config)) {
    return config.projectId || null
  }

  return null
}
