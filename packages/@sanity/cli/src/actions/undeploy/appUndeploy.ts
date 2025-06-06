import {confirm} from '@inquirer/prompts'
import {type Command} from '@oclif/core'
import chalk from 'chalk'
import {type SanityClient} from '@sanity/client'

import {type CliConfig} from '../../config/cli/types.js'
import {spinner} from '../../core/spinner.js'
import {
  deleteUserApplication,
  getUserApplication,
} from '../../services/userApplications.js'

interface UndeployAppOptions {
  client: SanityClient
  cliConfig: CliConfig
  flags: {yes: boolean}
  log: Command['log']
}

/**
 * Undeploy a Sanity application.
 *
 * @internal
 */
export async function undeployApp(options: UndeployAppOptions) {
  const {client, cliConfig, flags, log} = options
  let spin = spinner('Checking application info').start()
  const appId = 'app' in cliConfig ? cliConfig.app?.id : undefined

  if (!appId) {
    spin.fail()
    log('No application ID provided.')
    log('Please set id in `app` in sanity.cli.js or sanity.cli.ts.')
    log('Nothing to undeploy.')
    return
  }

  const userApplication = await getUserApplication({client, appId})
  spin.succeed()

  if (!userApplication) {
    spin.fail()
    log('Application with the given ID does not exist.')
    log('Nothing to undeploy.')
    return
  }

  if (!flags.yes) {
    const shouldUndeploy = await confirm({
      type: 'confirm',
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

  spin = spinner('Undeploying application').start()
  try {
    await deleteUserApplication({
      client,
      applicationId: userApplication.id,
      appType: 'coreApp',
    })
    spin.succeed()
  } catch (err) {
    spin.fail()
    throw err
  }

  log(
    `Application undeploy scheduled. It might take a few minutes before ${chalk.yellow(
      userApplication.id,
    )} is unavailable.`,
  )
}
