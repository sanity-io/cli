import {basename, dirname} from 'node:path'
import {createGzip} from 'node:zlib'

import chalk from 'chalk'
import {pack} from 'tar-fs'

import {spinner} from '../../core/spinner.js'
import {createDeployment} from '../../services/userApplications.js'
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
  const appId = cliConfig.app?.id
  const isAutoUpdating = shouldAutoUpdate({cliConfig, flags})
  const installedSdkVersion = await readModuleVersion(sourceDir, '@sanity/sdk-react')

  if (!installedSdkVersion) {
    output.error(`Failed to find installed @sanity/sdk-react version`, {exit: 1})
    return
  }

  let spin = spinner('Verifying local content')

  try {
    let userApplication = await findUserApplicationForApp({
      cliConfig,
      output: options.output,
    })

    deployDebug(`User application found`, userApplication)

    if (!userApplication) {
      deployDebug(`No user application found or selecting. Creating a new one`)

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

      // Ensure that the directory exists, is a directory and seems to have valid content
      spin = spin.start()
      try {
        await checkDir(sourceDir)
        spin.succeed()
      } catch (err) {
        spin.fail()
        deployDebug('Error checking directory', err)
        output.error('Error checking directory', {exit: 1})
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
      output.log(`\nSuccess! Application deployed`)

      if (!appId) {
        output.log(`\nAdd ${chalk.cyan(`id: '${userApplication.id}'`)}`)
        output.log('to `app` in sanity.cli.js or sanity.cli.ts')
        output.log(`to avoid prompting on next deploy.`)
      }
    }
  } catch (error) {
    spin.fail()
    console.error(error)
    deployDebug('Error deploying application', error)
    output.error('Error deploying application', {exit: 1})
  }
}
