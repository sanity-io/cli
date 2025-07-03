import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import chalk from 'chalk'

import {
  getStudioOrAppUserApplication,
  NO_APP_ID,
  NO_STUDIO_HOST,
} from '../actions/undeploy/getStudioOrAppUserApplication.js'
import {SanityCliCommand} from '../BaseCommand.js'
import {spinner} from '../core/spinner.js'
import {deleteUserApplication} from '../services/userApplications.js'
import {determineIsApp} from '../util/determineIsApp.js'

export class UndeployCommand extends SanityCliCommand<typeof UndeployCommand> {
  static override description = 'Removes the deployed Sanity Studio/App from Sanity hosting'

  static override flags = {
    yes: Flags.boolean({
      char: 'y',
      default: false,
      description:
        'Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(UndeployCommand)

    const cliConfig = await this.getCliConfig()
    const isApp = determineIsApp(cliConfig)

    let spin = spinner('Checking application info').start()
    try {
      const userApplication = await getStudioOrAppUserApplication({cliConfig})
      console.log(userApplication)
      if (!userApplication) {
        spin.fail()
        this.log('Application with the given ID does not exist.')
        this.log('Nothing to undeploy.')
        return
      }
      spin.succeed()

      if (!flags.yes) {
        const shouldUndeploy = await confirm({
          default: false,
          message: `This will undeploy ${chalk.yellow(
            userApplication.id,
          )} and make it unavailable for your users.\nThe hostname will be available for anyone to claim.\nAre you ${chalk.red(
            'sure',
          )} you want to undeploy?`,
        })

        if (!shouldUndeploy) {
          return
        }
      }

      spin = spinner(`Undeploying ${isApp ? 'application' : 'studio'}`).start()

      await deleteUserApplication({
        applicationId: userApplication.id,
        appType: isApp ? 'coreApp' : 'studio',
      })
      spin.succeed()

      if (isApp) {
        this.log(
          `Application undeploy scheduled. It might take a few minutes before ${chalk.yellow(
            userApplication.id,
          )} is unavailable.`,
        )
      } else {
        const url = `https://${chalk.yellow(userApplication.appHost)}.sanity.studio`
        this.log(
          `Studio undeploy scheduled. It might take a few minutes before ${url} is unavailable.`,
        )
      }
    } catch (error) {
      spin.fail()
      if (error.message === NO_APP_ID) {
        this.log('No application ID provided.')
        this.log('Please set id in `app` in sanity.cli.js or sanity.cli.ts.')
        this.log('Nothing to undeploy.')
        return
      }

      if (error.message === NO_STUDIO_HOST) {
        this.log('No studio host provided.')
        this.log('Please set `studioHost` in sanity.cli.js or sanity.cli.ts.')
        this.log('Nothing to undeploy.')
        return
      }

      this.error(error)
    }
  }
}
