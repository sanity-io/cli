import fs from 'node:fs/promises'
import path from 'node:path'

import {SanityCommand} from '@sanity/cli-core'

import {generateResourcesTs} from '../actions/build/writeSanityRuntime.js'
import {determineIsApp} from '../util/determineIsApp.js'

export class ResourcesCommand extends SanityCommand<typeof ResourcesCommand> {
  static override description = 'Generate .sanity/resources.ts from sanity.cli.ts configuration'

  static override examples = ['<%= config.bin %> <%= command.id %>']

  public async run(): Promise<void> {
    const cliConfig = await this.getCliConfig()

    if (!determineIsApp(cliConfig)) {
      this.output.error('The `resources` command is only available for Sanity app projects', {
        exit: 1,
      })
      return
    }

    const resources = cliConfig && 'app' in cliConfig ? cliConfig.app?.resources : undefined

    if (!resources || Object.keys(resources).length === 0) {
      this.output.log(
        'No resources configured in sanity.cli.ts — skipping generation.\n' +
          'Add an `app.resources` object to your CLI config to enable typed resources.',
      )
      return
    }

    const {directory: workDir} = await this.getProjectRoot()
    const sanityDir = path.join(workDir, '.sanity')
    await fs.mkdir(sanityDir, {recursive: true})
    await fs.writeFile(path.join(sanityDir, 'resources.ts'), generateResourcesTs(resources))

    this.output.log('Generated .sanity/resources.ts')
  }
}
