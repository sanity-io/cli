import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {CLIError} from '@oclif/core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {pack} from 'tar-fs'

import {createDeployment} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'
import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {buildStudio} from '../build/buildStudio.js'
import {shouldAutoUpdate} from '../build/shouldAutoUpdate.js'
import {extractManifest} from '../manifest/extractManifest.js'
import {generateManifest} from '../manifest/generateManifest.js'
import {deploySchemas} from '../schema/deploySchemas.js'
import {checkDir} from './checkDir.js'
import {createExternalStudioUserApplication} from './createExternalStudioUserApplication.js'
import {createStudioUserApplication} from './createStudioUserApplication.js'
import {deployDebug} from './deployDebug.js'
import {findUserApplicationForExternalStudio} from './findUserApplicationForExternalStudio.js'
import {findUserApplicationForStudio} from './findUserApplicationForStudio.js'
import {type DeployAppOptions} from './types.js'

export async function deployStudio(options: DeployAppOptions) {
  const {cliConfig, flags, output, sourceDir, workDir} = options

  const appHost = cliConfig.studioHost
  const appId = getAppId(cliConfig)
  const projectId = cliConfig.api?.projectId
  const installedSanityVersion = await getLocalPackageVersion('sanity', workDir)
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
    let userApplication
    if (flags.external) {
      userApplication =
        appId || appHost
          ? await findUserApplicationForExternalStudio({appHost, appId, output, projectId})
          : await createExternalStudioUserApplication(projectId, output)
    } else {
      userApplication = await findUserApplicationForStudio({appHost, appId, output, projectId})

      if (!userApplication) {
        output.log('Your project has not been assigned a studio hostname.')
        output.log('To deploy your Sanity Studio to our hosted sanity.studio service,')
        output.log('you will need one. Please enter the part you want to use.')

        userApplication = await createStudioUserApplication(projectId)
      }
    }

    deployDebug('Found user application', userApplication)

    // Always build the project, unless --no-build is passed or --external is used
    const shouldBuild = flags.build && !flags.external
    if (shouldBuild) {
      deployDebug(`Building studio`)
      await buildStudio({
        autoUpdatesEnabled: isAutoUpdating,
        calledFromDeploy: true,
        cliConfig,
        flags,
        outDir: sourceDir,
        output,
        workDir,
      })
    }

    if (!flags.external || flags['schema-required']) {
      await deploySchemas({
        output,
        verbose: flags.verbose,
        workDir,
      })
      await extractManifest(`${sourceDir}/static`)
    }

    const studioManifest = await generateManifest()

    let tarball

    if (!flags.external) {
      // Ensure that the directory exists, is a directory and seems to have valid content
      spin = spin.start('Verifying local content')
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
      tarball = pack(parentDir, {entries: [base]}).pipe(createGzip())
    }

    spin = spinner(flags.external ? 'Registering studio' : 'Deploying to sanity.studio').start()

    const {location} = await createDeployment({
      applicationId: userApplication.id,
      isApp: false,
      isAutoUpdating,
      projectId,
      studioManifest,
      tarball,
      version: installedSanityVersion,
    })

    spin.succeed()

    // And let the user know we're done
    if (flags.external) {
      output.log(`\nSuccess! Studio registered`)
    } else {
      output.log(`\nSuccess! Studio deployed to ${styleText('cyan', location || 'unknown URL')}`)
    }

    if (!appId) {
      output.log(`\nAdd ${styleText('cyan', `deployment: { appId: '${userApplication.id}' }`)}`)
      output.log(`to sanity.cli.js or sanity.cli.ts`)
      output.log(`to avoid prompting on next deploy.`)
    }
  } catch (error) {
    // if the error is a CLIError, we can just output the message and exit
    if (error instanceof CLIError) {
      output.error(error.message, {exit: 1})
      return
    }

    spin.fail()
    deployDebug('Error deploying studio', error)
    output.error(`Error deploying studio: ${error}`, {exit: 1})
  }
}
