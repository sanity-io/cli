import {existsSync} from 'node:fs'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {subdebug, type TelemetryUserProperties} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'
import {execa, type Options} from 'execa'

import {
  promptForAppendEnv,
  promptForEmbeddedStudio,
  promptForNextTemplate,
  promptForStudioPath,
} from '../../prompts/init/nextjs.js'
import {promptForTypeScript} from '../../prompts/init/promptForTypescript.js'
import {createCorsOrigin, listCorsOrigins} from '../../services/cors.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {getPeerDependencies} from '../../util/packageManager/getPeerDependencies.js'
import {installNewPackages} from '../../util/packageManager/installPackages.js'
import {
  getPartialEnvWithNpmPath,
  type PackageManager,
} from '../../util/packageManager/packageManagerChoice.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {countNestedFolders} from './countNestedFolders.js'
import {createOrAppendEnvVars} from './env/createOrAppendEnvVars.js'
import {InitError} from './initError.js'
import {
  flagOrDefault,
  getPostInitMCPPrompt,
  shouldPrompt,
  writeStagingEnvIfNeeded,
} from './initHelpers.js'
import {resolvePackageManager} from './resolvePackageManager.js'
import {
  sanityCliTemplate,
  sanityConfigTemplate,
  sanityFolder,
  sanityStudioTemplate,
} from './templates/nextjs/index.js'
import {type InitContext, type InitOptions, type VersionedFramework} from './types.js'

const debug = subdebug('init:nextjs')

export async function initNextJs({
  datasetName,
  detectedFramework,
  envFilename,
  mcpConfigured,
  options,
  output,
  projectId,
  trace,
  workDir,
}: {
  datasetName: string
  detectedFramework: VersionedFramework | null
  envFilename: string
  mcpConfigured: EditorName[]
  options: InitOptions
  output: InitContext['output']
  projectId: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  workDir: string
}): Promise<void> {
  let useTypeScript = flagOrDefault(options.typescript, true)
  if (shouldPrompt(options.unattended, options.typescript)) {
    useTypeScript = await promptForTypeScript()
  }
  trace.log({
    selectedOption: useTypeScript ? 'yes' : 'no',
    step: 'useTypeScript',
  })

  const fileExtension = useTypeScript ? 'ts' : 'js'
  let embeddedStudio = flagOrDefault(options.nextjsEmbedStudio, true)
  if (shouldPrompt(options.unattended, options.nextjsEmbedStudio)) {
    embeddedStudio = await promptForEmbeddedStudio()
  }
  let hasSrcFolder = false

  if (embeddedStudio) {
    // find source path (app or src/app)
    const appDir = 'app'
    let srcPath = path.join(workDir, appDir)

    if (!existsSync(srcPath)) {
      srcPath = path.join(workDir, 'src', appDir)
      hasSrcFolder = true
      if (!existsSync(srcPath)) {
        try {
          await mkdir(srcPath, {recursive: true})
        } catch {
          debug('Error creating folder %s', srcPath)
        }
      }
    }

    const studioPath = options.unattended ? '/studio' : await promptForStudioPath()

    const embeddedStudioRouteFilePath = path.join(
      srcPath,
      `${studioPath}/`,
      `[[...tool]]/page.${fileExtension}x`,
    )

    // this selects the correct template string based on whether the user is using the app or pages directory and
    // replaces the ":configPath:" placeholder in the template with the correct path to the sanity.config.ts file.
    // we account for the user-defined embeddedStudioPath (default /studio) is accounted for by creating enough "../"
    // relative paths to reach the root level of the project
    await writeOrOverwrite(
      embeddedStudioRouteFilePath,
      sanityStudioTemplate.replace(
        ':configPath:',
        `${'../'.repeat(countNestedFolders(embeddedStudioRouteFilePath.slice(workDir.length)))}sanity.config`,
      ),
      workDir,
      options,
    )

    const sanityConfigPath = path.join(workDir, `sanity.config.${fileExtension}`)
    await writeOrOverwrite(
      sanityConfigPath,
      sanityConfigTemplate(hasSrcFolder)
        .replace(':route:', embeddedStudioRouteFilePath.slice(workDir.length).replace('src/', ''))
        .replace(':basePath:', studioPath),
      workDir,
      options,
    )
  }

  const sanityCliPath = path.join(workDir, `sanity.cli.${fileExtension}`)
  await writeOrOverwrite(sanityCliPath, sanityCliTemplate, workDir, options)

  let templateToUse = options.template ?? 'clean'
  if (shouldPrompt(options.unattended, options.template)) {
    templateToUse = await promptForNextTemplate()
  }

  await writeSourceFiles({
    fileExtension,
    files: sanityFolder(useTypeScript, templateToUse as 'blog' | 'clean'),
    folderPath: undefined,
    options,
    srcFolderPrefix: hasSrcFolder,
    workDir,
  })

  let appendEnv = flagOrDefault(options.nextjsAppendEnv, true)
  if (shouldPrompt(options.unattended, options.nextjsAppendEnv)) {
    appendEnv = await promptForAppendEnv(envFilename)
  }

  if (appendEnv) {
    await createOrAppendEnvVars({
      envVars: {
        DATASET: datasetName,
        PROJECT_ID: projectId,
      },
      filename: envFilename,
      framework: detectedFramework,
      log: true,
      output,
      outputPath: workDir,
    })
  }

  if (embeddedStudio) {
    const nextjsLocalDevOrigin = 'http://localhost:3000'
    const existingCorsOrigins = await listCorsOrigins(projectId)
    const hasExistingCorsOrigin = existingCorsOrigins.some(
      (item: {origin: string}) => item.origin === nextjsLocalDevOrigin,
    )
    if (!hasExistingCorsOrigin) {
      try {
        const createCorsRes = await createCorsOrigin({
          allowCredentials: true,
          origin: nextjsLocalDevOrigin,
          projectId,
        })

        output.log(
          createCorsRes.id
            ? `Added ${nextjsLocalDevOrigin} to CORS origins`
            : `Failed to add ${nextjsLocalDevOrigin} to CORS origins`,
        )
      } catch (error) {
        debug(`Error creating new CORS Origin ${nextjsLocalDevOrigin}: ${error}`)
        const message = error instanceof Error ? error.message : String(error)
        throw new InitError(`Failed to add ${nextjsLocalDevOrigin} to CORS origins: ${message}`, 1)
      }
    }
  }

  const chosen = await resolvePackageManager({
    interactive: !options.unattended,
    output,
    packageManager: options.packageManager as PackageManager,
    targetDir: workDir,
  })
  trace.log({selectedOption: chosen, step: 'selectPackageManager'})
  const packages = ['@sanity/vision@5', 'sanity@5', '@sanity/image-url@2', 'styled-components@6']
  if (templateToUse === 'blog') {
    packages.push('@sanity/icons')
  }
  await installNewPackages(
    {
      packageManager: chosen,
      packages,
    },
    {
      output,
      workDir,
    },
  )

  // will refactor this later
  const execOptions: Options = {
    cwd: workDir,
    encoding: 'utf8',
    env: getPartialEnvWithNpmPath(workDir),
    stdio: 'inherit',
  }

  switch (chosen) {
    case 'bun': {
      await execa('bun', ['add', 'next-sanity@12'], execOptions)
      break
    }
    case 'npm': {
      await execa('npm', ['install', '--legacy-peer-deps', 'next-sanity@12'], execOptions)
      break
    }
    case 'pnpm': {
      await execa('pnpm', ['install', 'next-sanity@12'], execOptions)
      break
    }
    case 'yarn': {
      const peerDeps = await getPeerDependencies('next-sanity@12', workDir)
      await installNewPackages(
        {packageManager: 'yarn', packages: ['next-sanity@12', ...peerDeps]},
        {output, workDir},
      )
      break
    }
    default: {
      // manual - do nothing
      break
    }
  }

  output.log(
    `\n${styleText('green', 'Success!')} Your Sanity configuration files has been added to this project`,
  )
  if (mcpConfigured && mcpConfigured.length > 0) {
    const message = await getPostInitMCPPrompt(mcpConfigured)
    output.log(`\n${message}`)
    output.log(`\nLearn more: ${styleText('cyan', 'https://mcp.sanity.io')}`)
    output.log(
      `\nHave feedback? Tell us in the community: ${styleText('cyan', 'https://www.sanity.io/community/join')}`,
    )
  }

  await writeStagingEnvIfNeeded(output, workDir)
}

async function writeOrOverwrite(
  filePath: string,
  content: string,
  workDir: string,
  options: InitOptions,
): Promise<void> {
  if (existsSync(filePath)) {
    let overwrite = flagOrDefault(options.overwriteFiles, false)
    if (shouldPrompt(options.unattended, options.overwriteFiles)) {
      overwrite = await confirm({
        default: false,
        message: `File ${styleText(
          'yellow',
          filePath.replace(workDir, ''),
        )} already exists. Do you want to overwrite it?`,
      })
    }

    if (!overwrite) {
      return
    }
  }

  // make folder if not exists
  const folderPath = path.dirname(filePath)

  try {
    await mkdir(folderPath, {recursive: true})
  } catch {
    debug('Error creating folder %s', folderPath)
  }

  await writeFile(filePath, content, {
    encoding: 'utf8',
  })
}

// write sanity folder files
async function writeSourceFiles({
  fileExtension,
  files,
  folderPath,
  options,
  srcFolderPrefix,
  workDir,
}: {
  fileExtension: string
  files: Record<string, Record<string, string> | string>
  folderPath?: string
  options: InitOptions
  srcFolderPrefix?: boolean
  workDir: string
}): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    // check if file ends with full stop to indicate it's file and not directory (this only works with our template tree structure)
    if (filePath.includes('.') && typeof content === 'string') {
      await writeOrOverwrite(
        path.join(
          workDir,
          srcFolderPrefix ? 'src' : '',
          'sanity',
          folderPath || '',
          `${filePath}${fileExtension}`,
        ),
        content,
        workDir,
        options,
      )
    } else {
      await mkdir(path.join(workDir, srcFolderPrefix ? 'src' : '', 'sanity', filePath), {
        recursive: true,
      })
      if (typeof content === 'object') {
        await writeSourceFiles({
          fileExtension,
          files: content,
          folderPath: filePath,
          options,
          srcFolderPrefix,
          workDir,
        })
      }
    }
  }
}
