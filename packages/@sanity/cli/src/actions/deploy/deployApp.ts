import {basename, dirname} from 'node:path'
import {createGzip} from 'node:zlib'

import {CLIError} from '@oclif/core/errors'
import {spinner} from '@sanity/cli-core'
import chalk from 'chalk'
import {pack} from 'tar-fs'

import {createDeployment} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_ORGANIZATION_ID} from '../../util/errorMessages.js'
import {readModuleVersion} from '../../util/readModuleVersion.js'
import {buildApp} from '../build/buildApp.js'
import {shouldAutoUpdate} from '../build/shouldAutoUpdate.js'
import {checkDir} from './checkDir.js'
import {createUserApplicationForApp} from './createUserApplicationForApp.js'
import {deployDebug} from './deployDebug.js'
import {findUserApplicationForApp} from './findUserApplicationForApp.js'
import {type DeployAppOptions} from './types.js'

/**
 * Deploy a Sanity application.
 *
 * @internal
 */
export async function deployApp(options: DeployAppOptions) {
  const {cliConfig, exit, flags, output, sourceDir, workDir} = options

  const organizationId = cliConfig.app?.organizationId
  const appId = getAppId(cliConfig)
  const isAutoUpdating = shouldAutoUpdate({cliConfig, flags, output})
  const installedSdkVersion = await readModuleVersion(sourceDir, '@sanity/sdk-react')

  if (!installedSdkVersion) {
    output.error(`Failed to find installed @sanity/sdk-react version`, {exit: 1})
    return
  }

  if (!organizationId) {
    output.error(NO_ORGANIZATION_ID, {exit: 1})
    return
  }

  let spin = spinner('Verifying local content...')

  try {
    let userApplication = await findUserApplicationForApp({
      cliConfig,
      organizationId,
      output,
    })

    deployDebug(`User application found`, userApplication)

    if (!userApplication) {
      deployDebug(`No user application found. Creating a new one`)

      userApplication = await createUserApplicationForApp(organizationId)
      deployDebug(`User application created`, userApplication)
    }

    // Always build the project, unless --no-build is passed
    const shouldBuild = flags.build
    if (shouldBuild) {
      deployDebug(`Building app`)
      await buildApp({
        autoUpdatesEnabled: isAutoUpdating,
        cliConfig,
        exit,
        flags,
        outDir: sourceDir,
        output,
        workDir,
      })
    }

    // Ensure that the directory exists, is a directory and seems to have valid content
    spin = spin.start()
    try {
      await checkDir(sourceDir)
      spin.succeed()
    } catch (err) {
      spin.fail()
      deployDebug('Error checking directory', err)
      output.error('Error checking directory', {exit: 1})
      return
    }

    // Create a tarball of the given directory
    const parentDir = dirname(sourceDir)
    const base = basename(sourceDir)
    const tarball = pack(parentDir, {entries: [base]}).pipe(createGzip())

    spin = spinner('Deploying...').start()
    await createDeployment({
      applicationId: userApplication.id,
      isApp: true,
      isAutoUpdating,
      tarball,
      version: installedSdkVersion,
    })

    spin.succeed()

    // And let the user know we're done
    output.log(`\n🚀 ${chalk.bold('Success!')} Application deployed`)

    if (!appId) {
      output.log(`\n════ ${chalk.bold('Next step:')} ════`)
      output.log(
        chalk.bold('\nAdd the deployment.appId to your sanity.cli.js or sanity.cli.ts file:'),
      )
      output.log(`
${chalk.dim(`app: {
  // your application config here…
}`)},
${chalk.bold.green(`deployment: {
  appId: '${userApplication.id}',
}\n`)}`)
    }
  } catch (error) {
    spin.clear()
    // Don't throw generic error if user cancels
    if (error.name === 'ExitPromptError') {
      output.error('Deployment cancelled by user', {exit: 1})
      return
    }
    // If the error is a CLIError, we can just output the message & error options (if any), while ensuring we exit
    if (error instanceof CLIError) {
      const {message, ...errorOptions} = error
      output.error(message, {...errorOptions, exit: 1})
      return
    }

    deployDebug('Error deploying application', error)
    output.error('Error deploying application', {exit: 1})
  }
}
