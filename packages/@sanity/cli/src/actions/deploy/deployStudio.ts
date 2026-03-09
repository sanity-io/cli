import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip, type Gzip} from 'node:zlib'

import {CLIError} from '@oclif/core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type StudioManifest} from 'sanity'
import {pack} from 'tar-fs'

import {createDeployment} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'
import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {buildStudio} from '../build/buildStudio.js'
import {shouldAutoUpdate} from '../build/shouldAutoUpdate.js'
import {formatSchemaValidation} from '../schema/formatSchemaValidation.js'
import {SchemaExtractionError} from '../schema/utils/SchemaExtractionError.js'
import {checkDir} from './checkDir.js'
import {createStudioUserApplication} from './createStudioUserApplication.js'
import {deployDebug} from './deployDebug.js'
import {deployStudioSchemasAndManifests} from './deployStudioSchemasAndManifests.js'
import {findUserApplicationForStudio} from './findUserApplicationForStudio.js'
import {type DeployAppOptions} from './types.js'

export async function deployStudio(options: DeployAppOptions) {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options

  const workDir = projectRoot.directory
  const configPath = projectRoot.path

  const appHost = cliConfig.studioHost
  const appId = getAppId(cliConfig)
  const projectId = cliConfig.api?.projectId
  const installedSanityVersion = await getLocalPackageVersion('sanity', workDir)
  const isAutoUpdating = shouldAutoUpdate({cliConfig, flags, output})

  const isExternal = !!flags.external
  const urlType: 'external' | 'internal' = isExternal ? 'external' : 'internal'

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
      urlType,
    })

    if (!userApplication) {
      if (isExternal) {
        output.log('Your project has not been registered with an external studio URL.')
        output.log('Please enter the full URL where your studio is hosted.')
      } else {
        output.log('Your project has not been assigned a studio hostname.')
        output.log('To deploy your Sanity Studio to our hosted sanity.studio service,')
        output.log('you will need one. Please enter the part you want to use.')
      }

      userApplication = await createStudioUserApplication({projectId, urlType})

      deployDebug('Created user application', userApplication)
    }

    deployDebug('Found user application', userApplication)

    // Always build the project, unless --no-build is passed or --external is passed
    const shouldBuild = flags.build && !isExternal
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

    let studioManifest: StudioManifest | null = null
    try {
      studioManifest = await deployStudioSchemasAndManifests({
        configPath,
        isExternal,
        outPath: `${sourceDir}/static`,
        projectId,
        schemaRequired: flags['schema-required'],
        verbose: flags.verbose,
        workDir,
      })
    } catch (error) {
      deployDebug('Error deploying studio schemas and manifests', error)
      if (error instanceof SchemaExtractionError) {
        output.error(formatSchemaValidation(error.validation || []), {exit: 1})
      }
      output.error(`Error deploying studio schemas and manifests: ${error}`, {exit: 1})
    }

    if (!studioManifest) {
      output.error('Failed to generate studio manifest. Please check your schemas and manifests.', {
        exit: 1,
      })
    }

    let tarball: Gzip | undefined

    if (!isExternal) {
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
      tarball = pack(parentDir, {entries: [base]}).pipe(createGzip())
    }

    spin = spinner(isExternal ? 'Registering studio' : 'Deploying to sanity.studio').start()

    const {location} = await createDeployment({
      applicationId: userApplication.id,
      isApp: false,
      isAutoUpdating,
      manifest: studioManifest,
      projectId,
      tarball,
      version: installedSanityVersion,
    })

    spin.succeed()

    if (isExternal) {
      output.log(`\nSuccess! Studio registered`)
    } else {
      output.log(`\nSuccess! Studio deployed to ${styleText('cyan', location)}`)
    }

    if (!appId) {
      const example = `Example:
export default defineCliConfig({
  //…
  deployment: {
    ${styleText('cyan', `appId: '${userApplication.id}'`)},
  },
  //…
})`
      output.log(`\nAdd ${styleText('cyan', `appId: '${userApplication.id}'`)}`)
      output.log(`to the \`deployment\` section in sanity.cli.js or sanity.cli.ts`)
      output.log(`to avoid prompting for application id on next deploy.`)
      output.log(`\n${example}`)
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
