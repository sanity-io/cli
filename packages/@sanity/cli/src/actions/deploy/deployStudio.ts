import {basename, dirname} from 'node:path'
import {createGzip} from 'node:zlib'

import {CLIError} from '@oclif/core/errors'
import {spinner} from '@sanity/cli-core'
import chalk from 'chalk'
import {pack} from 'tar-fs'

import {createDeployment} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'
import {readModuleVersion} from '../../util/readModuleVersion.js'
import {buildStudio} from '../build/buildStudio.js'
import {shouldAutoUpdate} from '../build/shouldAutoUpdate.js'
import {checkDir} from './checkDir.js'
import {createStudioUserApplication} from './createStudioUserApplication.js'
import {deployDebug} from './deployDebug.js'
import {findUserApplicationForStudio} from './findUserApplicationForStudio.js'
import {type DeployAppOptions} from './types.js'

export async function deployStudio(options: DeployAppOptions) {
  const {cliConfig, exit, flags, output, sourceDir, workDir} = options

  const appHost = cliConfig.studioHost
  const appId = getAppId(cliConfig)
  const projectId = cliConfig.api?.projectId
  const installedSanityVersion = await readModuleVersion(sourceDir, 'sanity')
  const isAutoUpdating = shouldAutoUpdate({cliConfig, flags, output})

  if (!installedSanityVersion) {
    output.error(`Failed to find installed sanity version`, {exit: 1})
    return
  }

  if (!projectId) {
    output.error(NO_PROJECT_ID, {exit: 1})
    return
  }

  let spin = spinner('Verifying local content')

  try {
    let userApplication = await findUserApplicationForStudio({
      appHost,
      appId,
      output,
      projectId,
    })

    if (!userApplication) {
      // otherwise, prompt the user for a hostname
      output.log('Your project has not been assigned a studio hostname.')
      output.log('To deploy your Sanity Studio to our hosted sanity.studio service,')
      output.log('you will need one. Please enter the part you want to use.')

      userApplication = await createStudioUserApplication(projectId)

      deployDebug('Created user application', userApplication)
    }

    deployDebug('Found user application', userApplication)

    // Always build the project, unless --no-build is passed
    const shouldBuild = flags.build
    if (shouldBuild) {
      deployDebug(`Building studio`)
      await buildStudio({
        autoUpdatesEnabled: isAutoUpdating,
        cliConfig,
        exit,
        flags,
        outDir: sourceDir,
        output,
        workDir,
      })
    }

    // TODO: Implement schema deployment
    // await deploySchemasAction(
    //   {
    //     'extract-manifest': shouldBuild,
    //     'manifest-dir': `${sourceDir}/static`,
    //     'schema-required': flags['schema-required'],
    //     'verbose': flags.verbose,
    //   },
    //   {...context, manifestExtractor: createManifestExtractor(context)},
    // )

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

    spin = spinner('Deploying to sanity.studio').start()

    const {location} = await createDeployment({
      applicationId: userApplication.id,
      isApp: false,
      isAutoUpdating,
      projectId,
      tarball,
      version: installedSanityVersion,
    })

    spin.succeed()

    // And let the user know we're done
    output.log(`\nSuccess! Studio deployed to ${chalk.cyan(location)}`)

    if (!appId) {
      output.log(`\nAdd ${chalk.cyan(`appId: '${userApplication.id}'`)}`)
      output.log(`to the deployment section in sanity.cli.js or sanity.cli.ts`)
      output.log(`to avoid prompting for hostname on next deploy.`)
    }
  } catch (error) {
    // if the error is a CLIError, we can just output the message and exit
    if (error instanceof CLIError) {
      output.error(error.message, {exit: 1})
      return
    }

    spin.fail()
    deployDebug('Error deploying studio', error)
    output.error('Error deploying studio', {exit: 1})
  }
}
