import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import {SanityCommand, spinner} from '@sanity/cli-core'
import chalk from 'chalk'

import {
  getStudioOrAppUserApplication,
  NO_APP_ID,
  NO_STUDIO_HOST,
} from '../actions/undeploy/getStudioOrAppUserApplication.js'
import {deleteUserApplication} from '../services/userApplications.js'
import {determineIsApp} from '../util/determineIsApp.js'

export class UndeployCommand extends SanityCommand<typeof UndeployCommand> {
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
      if (!userApplication) {
        spin.fail()
        if (isApp) {
          this.log('Application with the given ID does not exist.')
          this.log('Nothing to undeploy.')
        } else {
          this.log('Your project has not been assigned a studio hostname')
          this.log('or the `studioHost` provided does not exist.')
          this.log('Nothing to undeploy.')
        }

        return
      }
      spin.succeed()

      const url = `https://${chalk.yellow(userApplication.appHost)}.sanity.studio`

      if (!flags.yes) {
        let message = `This will undeploy ${url} and make it unavailable for your users.\nThe hostname will be available for anyone to claim.\nAre you ${chalk.red(
          'sure',
        )} you want to undeploy?`

        if (isApp) {
          message = `This will undeploy the following application:

    Title: ${chalk.yellow(userApplication.title || '(untitled application)')}
    ID:    ${chalk.yellow(userApplication.id)}

The application will no longer be available for any of your users if you proceed.

Are you ${chalk.red('sure')} you want to undeploy?`
        }

        const shouldUndeploy = await confirm({
          default: false,
          message,
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
          `\nApplication undeploy scheduled. It might be a few minutes until ${
            userApplication.title ? chalk.yellow(userApplication.title) : 'your application'
          } is unavailable.`,
        )
      } else {
        this.log(
          `\nStudio undeploy scheduled. It might be a few minutes until ${url} is unavailable.`,
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
