import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import {confirm, spinner} from '@sanity/cli-core/ux'

import {
  getStudioOrAppUserApplication,
  NO_APP_ID,
  NO_APP_ID_OR_STUDIO_HOST,
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
    const output = this.output
    const isApp = determineIsApp(cliConfig)

    let spin = spinner('Checking application info').start()
    try {
      const userApplication = await getStudioOrAppUserApplication({cliConfig, output})
      if (!userApplication) {
        spin.fail()
        if (isApp) {
          this.log('Application with the given ID does not exist.')
          this.log('Nothing to undeploy.')
        } else {
          this.log('Your project has not been assigned an app ID or a studio hostname,')
          this.log('or the `appId` or `studioHost` provided does not exist.')
          this.log('Nothing to undeploy.')
        }

        return
      }
      spin.succeed()

      const url = `https://${styleText('yellow', userApplication.appHost)}.sanity.studio`

      if (!flags.yes) {
        let message = `This will undeploy ${url} and make it unavailable for your users.\nThe hostname will be available for anyone to claim.\nAre you ${styleText(
          'red',
          'sure',
        )} you want to undeploy?`

        if (isApp) {
          message = `This will undeploy the following application:

    Title: ${styleText('yellow', userApplication.title || '(untitled application)')}
    ID:    ${styleText('yellow', userApplication.id)}

The application will no longer be available for any of your users if you proceed.

Are you ${styleText('red', 'sure')} you want to undeploy?`
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
          `\n${styleText('bold', '⏱️ Application undeploy scheduled.')} It might be a few minutes until ${
            userApplication.title
              ? styleText('italic', `'${userApplication.title}'`)
              : 'your application'
          } is unavailable.`,
        )
        this.log(
          `\n${styleText('bold', 'Remember to remove `deployment.appId` from your application configuration')} to avoid errors when redeploying.`,
        )
      } else {
        this.log(
          `\nStudio undeploy scheduled. It might be a few minutes until ${url} is unavailable.`,
        )
      }
    } catch (error) {
      spin.fail()
      const message = error instanceof Error ? error.message : String(error)
      if (message === NO_APP_ID) {
        this.log('No application ID provided.')
        this.log('Please set id in `deployment.appId` in sanity.cli.js or sanity.cli.ts.')
        this.log('Nothing to undeploy.')
        return
      }

      if (message === NO_APP_ID_OR_STUDIO_HOST) {
        this.log('No application ID or studio host provided.')
        this.log('Please set id in `deployment.appId` in sanity.cli.js or sanity.cli.ts.')
        this.log('Nothing to undeploy.')
        return
      }

      this.error(error instanceof Error ? error : String(error))
    }
  }
}
