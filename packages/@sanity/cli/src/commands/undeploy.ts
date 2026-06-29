import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {type CliConfig, SanityCommand} from '@sanity/cli-core'
import {confirm, select, spinner, type SpinnerInstance} from '@sanity/cli-core/ux'

import {
  deleteUserApplication,
  getUserApplication,
  getUserApplications,
  type UserApplication,
} from '../services/userApplications.js'
import {getAppId} from '../util/appId.js'
import {determineIsApp} from '../util/determineIsApp.js'
import {NO_PROJECT_ID} from '../util/errorMessages.js'

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
    const cliConfig = await this.getCliConfig()
    const isApp = determineIsApp(cliConfig)

    // Figure out which application/studio to undeploy.
    // Uses config if available, otherwise prompts interactively.
    const userApplication = await this.resolveApplication(cliConfig, isApp)

    // No application/studio found or selected → exit cleanly (message already printed)
    if (!userApplication) return

    // Ask the user to confirm undeploy (skipped in unattended/CI mode)
    if (!this.isUnattended()) {
      const confirmed = await this.confirmUndeploy(userApplication, isApp)
      if (!confirmed) return
    }

    // Delete and report
    const spin = spinner(`Undeploying ${isApp ? 'application' : 'studio'}`).start()
    try {
      await deleteUserApplication({
        applicationId: userApplication.id,
        appType: isApp ? 'coreApp' : 'studio',
      })
    } catch (err) {
      spin.fail()
      this.error(err instanceof Error ? err : String(err))
    }
    spin.succeed()

    const label = isApp
      ? userApplication.title
        ? styleText('italic', `'${userApplication.title}'`)
        : 'your application'
      : `https://${styleText('yellow', userApplication.appHost)}.sanity.studio`

    this.log(
      `\n${styleText('bold', `${isApp ? 'Application' : 'Studio'} undeploy scheduled.`)} It might be a few minutes until ${label} is unavailable.`,
    )

    if (cliConfig.deployment?.appId) {
      this.log(
        `\n${styleText('bold', 'Remember to remove `deployment.appId` from your sanity.cli.(ts|js)`')} to avoid errors when redeploying.`,
      )
    } else if (cliConfig.app?.id) {
      this.log(
        `\n${styleText('bold', 'Remember to remove `app.id` from your sanity.cli.(ts|js)`')} to avoid errors when redeploying.`,
      )
    }
  }

  private async confirmUndeploy(
    userApplication: UserApplication,
    isApp: boolean,
  ): Promise<boolean> {
    let message: string

    if (isApp) {
      message = `This will undeploy the following application:

    Title: ${styleText('yellow', userApplication.title || '(untitled application)')}
    ID:    ${styleText('yellow', userApplication.id)}

The application will no longer be available for any of your users if you proceed.

Are you ${styleText('red', 'sure')} you want to undeploy?`
    } else {
      const url = `https://${styleText('yellow', userApplication.appHost)}.sanity.studio`
      message = `This will undeploy ${url} and make it unavailable for your users.\nThe hostname will be available for anyone to claim.\nAre you ${styleText(
        'red',
        'sure',
      )} you want to undeploy?`
    }

    return confirm({default: false, message})
  }

  private async fetchApplication(
    spin: SpinnerInstance,
    fetch: () => Promise<UserApplication | null>,
  ): Promise<UserApplication | undefined> {
    try {
      return (await fetch()) ?? undefined
    } catch (err) {
      spin.fail()
      this.error(err instanceof Error ? err : String(err))
    }
  }

  private async promptForApp(
    spin: SpinnerInstance,
    cliConfig: CliConfig,
  ): Promise<UserApplication | undefined> {
    const organizationId = cliConfig.app?.organizationId
    if (!organizationId) {
      spin.info('No organization ID configured. Cannot list applications.')
      return undefined
    }

    let result: UserApplication[]
    try {
      result = await getUserApplications({appType: 'coreApp', organizationId})
    } catch (err) {
      spin.fail()
      this.error(err instanceof Error ? err : String(err))
    }
    if (result.length === 0) {
      spin.info('No deployed applications found for your organization.')
      this.log('Nothing to undeploy.')
      return undefined
    }

    spin.info('No application ID configured')

    const choices = result.map((app) => ({
      name: app.title ? `${app.title} (${app.appHost})` : app.appHost,
      value: app.id,
    }))

    const selectedId = await select({
      choices,
      message: 'Select an application to undeploy:',
    })

    return result.find((app) => app.id === selectedId)
  }

  private async promptForApplication(
    spin: SpinnerInstance,
    cliConfig: CliConfig,
    isApp: boolean,
  ): Promise<UserApplication | undefined> {
    spin.text = isApp ? 'Looking for deployed applications...' : 'Looking for deployed studios...'

    return isApp ? this.promptForApp(spin, cliConfig) : this.promptForStudio(spin, cliConfig)
  }

  private async promptForStudio(
    spin: SpinnerInstance,
    cliConfig: CliConfig,
  ): Promise<UserApplication | undefined> {
    const projectId = cliConfig.api?.projectId
    if (!projectId) {
      spin.info('No project ID configured. Cannot list studios.')
      return undefined
    }

    let studios: UserApplication[]
    try {
      studios = await getUserApplications({appType: 'studio', projectId})
    } catch (err) {
      spin.fail()
      this.error(err instanceof Error ? err : String(err))
    }
    if (studios.length === 0) {
      spin.info('No deployed studios found for your project.')
      this.log('Nothing to undeploy.')
      return undefined
    }

    spin.info('No studio host configured')

    const choices = studios.map((app) => ({
      name: app.title ? `${app.title} (${app.appHost})` : app.appHost,
      value: app.id,
    }))

    const selectedId = await select({
      choices,
      message: 'Select a studio to undeploy:',
    })

    return studios.find((app) => app.id === selectedId)
  }

  // Determines which application/studio to undeploy. Three paths:
  //
  // 1. Config has an identifier (appId for apps, studioHost/deployment.appId for studios)
  //    → look it up via the API, return it if found
  // 2. No identifier configured, interactive terminal
  //    → list all deployed apps/studios and let the user pick
  // 3. No identifier configured, unattended (--yes or non-TTY)
  //    → bail with a helpful message
  private async resolveApplication(
    cliConfig: CliConfig,
    isApp: boolean,
  ): Promise<UserApplication | undefined> {
    const spin = spinner('Checking application info').start()

    // --- App path ---
    if (isApp) {
      const appId = getAppId(cliConfig)

      // Has app ID → look it up
      if (appId) {
        const result = await this.fetchApplication(spin, () =>
          getUserApplication({appId, isSdkApp: true}),
        )
        if (!result) {
          spin.fail()
          this.log('Application with the given ID does not exist.')
          this.log('Nothing to undeploy.')
          return undefined
        }
        spin.succeed()
        return result
      }

      // No app ID → prompt or bail
      if (this.isUnattended()) {
        spin.fail()
        this.log('No application ID provided.')
        this.log('Please set id in `deployment.appId` in sanity.cli.js or sanity.cli.ts.')
        this.log('Nothing to undeploy.')
        return undefined
      }

      return this.promptForApplication(spin, cliConfig, isApp)
    }

    // --- Studio path ---

    // Has studioHost or deployment.appId → look it up
    if (cliConfig.studioHost || cliConfig.deployment?.appId) {
      const projectId = cliConfig.api?.projectId
      if (!projectId) {
        spin.fail()
        this.error(NO_PROJECT_ID)
      }

      const result = await this.fetchApplication(spin, () =>
        getUserApplication({
          appHost: cliConfig.studioHost,
          appId: cliConfig.deployment?.appId,
          isSdkApp: false,
          projectId,
        }),
      )
      if (!result) {
        spin.fail()
        this.log('The configured `appId` or `studioHost` does not exist.')
        this.log('Nothing to undeploy.')
        return undefined
      }
      spin.succeed()
      return result
    }

    // No studio identifier → prompt or bail
    if (this.isUnattended()) {
      spin.fail()
      this.log('No application ID or studio host provided.')
      this.log('Please set id in `deployment.appId` in sanity.cli.js or sanity.cli.ts.')
      this.log('Nothing to undeploy.')
      return undefined
    }

    return this.promptForApplication(spin, cliConfig, isApp)
  }
}
