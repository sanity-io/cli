import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {CLIError} from '@oclif/core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {pack} from 'tar-fs'

import {createDeployment, updateUserApplication} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_ORGANIZATION_ID} from '../../util/errorMessages.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {buildApp} from '../build/buildApp.js'
import {shouldAutoUpdate} from '../build/shouldAutoUpdate.js'
import {extractAppManifest} from '../manifest/extractAppManifest.js'
import {type AppManifest} from '../manifest/types.js'
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
  const {cliConfig, flags, output, projectRoot, sourceDir} = options

  const workDir = projectRoot.directory

  const organizationId = cliConfig.app?.organizationId
  const appId = getAppId(cliConfig)
  const isAutoUpdating = shouldAutoUpdate({cliConfig, flags, output})
  const installedSdkVersion = await getLocalPackageVersion('@sanity/sdk-react', workDir)

  if (!installedSdkVersion) {
    output.error(`Failed to find installed @sanity/sdk-react version`, {exit: 1})
    return
  }

  if (!organizationId) {
    output.error(NO_ORGANIZATION_ID, {exit: 1})
    return
  }

  if (flags.external) {
    output.error('Deploying an app to an external host is not supported.', {exit: 1})
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
        calledFromDeploy: true,
        cliConfig,
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
    let manifest: AppManifest | undefined
    try {
      manifest = await extractAppManifest({workDir})
    } catch (err) {
      deployDebug('Error extracting app manifest', err)
      const message = getErrorMessage(err)
      // manifests aren't strictly essential, so continue deploy
      output.warn(`Error extracting app manifest: ${message}`)
    }

    // Sync app title from manifest when it has changed (Brett user-applications)
    if (manifest?.title !== undefined && manifest.title !== userApplication.title) {
      deployDebug('Updating application title from manifest', {
        from: userApplication.title,
        to: manifest.title,
      })
      const existing = userApplication.title
      output.log(
        existing
          ? `Updating title from "${existing}" to "${manifest.title}"`
          : `Setting application title to "${manifest.title}"`,
      )
      spin = spinner(`Updating application title`).start()
      try {
        userApplication = await updateUserApplication({
          applicationId: userApplication.id,
          appType: 'coreApp',
          body: {title: manifest.title},
        })
        spin.succeed()
      } catch (err) {
        spin.fail()
        const message = getErrorMessage(err)
        deployDebug('Error updating application title', {message})
        output.warn(`Error updating application title: ${message}`)
      }
    }

    spin = spinner('Deploying...').start()
    await createDeployment({
      applicationId: userApplication.id,
      isApp: true,
      isAutoUpdating,
      manifest,
      tarball,
      version: installedSdkVersion,
    })

    spin.succeed()

    // And let the user know we're done
    output.log(`\n🚀 ${styleText('bold', 'Success!')} Application deployed`)

    if (!appId) {
      output.log(`\n════ ${styleText('bold', 'Next step:')} ════`)
      output.log(
        styleText(
          'bold',
          '\nAdd the deployment.appId to your sanity.cli.js or sanity.cli.ts file:',
        ),
      )
      output.log(`
${styleText(
  'dim',
  `app: {
  // your application config here…
}`,
)},
${styleText(
  ['bold', 'green'],
  `deployment: {
  appId: '${userApplication.id}',
}\n`,
)}`)
    }
  } catch (error) {
    spin.clear()
    // Don't throw generic error if user cancels
    if (error instanceof Error && error.name === 'ExitPromptError') {
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
    output.error(`Error deploying application: ${error}`, {exit: 1})
  }
}
