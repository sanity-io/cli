import {confirm} from '@inquirer/prompts'
import {type Command} from '@oclif/core'
import {type SanityClient} from '@sanity/client'
import chalk from 'chalk'

import {type CliConfig} from '../../config/cli/types.js'
import {spinner} from '../../core/spinner.js'
import {deleteUserApplication, getUserApplication} from '../../services/userApplications.js'

interface UndeployStudioOptions {
  cliConfig: CliConfig
  client: SanityClient
  flags: {yes: boolean}
  log: Command['log']
}

/**
 * Undeploy a Sanity Studio.
 *
 * @internal
 */
export async function undeployStudio(options: UndeployStudioOptions) {
  const {cliConfig, client, flags, log} = options
  let spin = spinner('Checking project info').start()
  const userApplication = await getUserApplication({
    appHost: 'studioHost' in cliConfig ? cliConfig.studioHost : undefined,
    client,
  })
  spin.succeed()

  if (!userApplication) {
    log('Your project has not been assigned a studio hostname')
    log('or the `studioHost` provided does not exist.')
    log('Nothing to undeploy.')
    return
  }

  const url = `https://${chalk.yellow(userApplication.appHost)}.sanity.studio`

  if (!flags.yes) {
    const shouldUndeploy = await confirm({
      default: false,
      message: `This will undeploy ${url} and make it unavailable for your users.\nThe hostname will be available for anyone to claim.\nAre you ${chalk.red(
        'sure',
      )} you want to undeploy?`,
    })

    if (!shouldUndeploy) {
      return
    }
  }

  spin = spinner('Undeploying studio').start()
  try {
    await deleteUserApplication({
      applicationId: userApplication.id,
      appType: 'studio',
      client,
    })
    spin.succeed()
  } catch (err) {
    spin.fail()
    throw err
  }

  log(`Studio undeploy scheduled. It might take a few minutes before ${url} is unavailable.`)
}
