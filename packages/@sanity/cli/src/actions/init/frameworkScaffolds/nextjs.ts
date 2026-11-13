import {existsSync} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'

import {subdebug} from '@sanity/cli-core'

import {promptForAppendEnv, promptForStudioPath} from '../../../prompts/init/nextjs.js'
import {createCorsOrigin, listCorsOrigins} from '../../../services/cors.js'
import {countNestedFolders} from '../countNestedFolders.js'
import {createOrAppendEnvVars} from '../env/createOrAppendEnvVars.js'
import {InitError} from '../initError.js'
import {flagOrDefault, shouldPrompt} from '../initHelpers.js'
import {writeStudioSource} from '../inPlaceStudioBase.js'
import {
  nextClientFolder,
  sanityCliTemplate,
  sanityConfigTemplate,
  sanityStudioTemplate,
} from '../templates/nextjs/index.js'
import {writeOrOverwrite, writeSourceFiles} from '../writeFiles.js'
import {type FrameworkScaffold, type ScaffoldContext} from './types.js'

const debug = subdebug('init')

const NEXTJS_LOCAL_DEV_ORIGIN = 'http://localhost:3000'

export const nextjsScaffold: FrameworkScaffold = {
  allowDevOrigin,
  appendEnv,
  clientPackage: 'next-sanity@13',
  id: 'nextjs',
  packages: ['@sanity/image-url@2'],
  writeClientFiles,
  writeEmbeddedStudio,
}

async function writeClientFiles(
  ctx: ScaffoldContext,
  {srcFolderPrefix}: {srcFolderPrefix: boolean},
): Promise<void> {
  await writeSourceFiles({
    fileExtension: ctx.fileExtension,
    files: nextClientFolder(ctx.useTypeScript),
    folderPath: undefined,
    options: ctx.options,
    srcFolderPrefix,
    workDir: ctx.workDir,
  })
}

async function appendEnv(ctx: ScaffoldContext): Promise<void> {
  const {datasetName, envFilename, framework, options, output, projectId, workDir} = ctx

  let shouldAppend = flagOrDefault(options.nextjsAppendEnv, true)
  if (shouldPrompt(options.unattended, options.nextjsAppendEnv)) {
    shouldAppend = await promptForAppendEnv(envFilename)
  }

  if (!shouldAppend) return

  await createOrAppendEnvVars({
    envVars: {
      DATASET: datasetName,
      PROJECT_ID: projectId,
    },
    filename: envFilename,
    framework,
    log: true,
    output,
    outputPath: workDir,
  })
}

async function allowDevOrigin({output, projectId}: ScaffoldContext): Promise<void> {
  const existingCorsOrigins = await listCorsOrigins(projectId)
  const hasExistingCorsOrigin = existingCorsOrigins.some(
    (item: {origin: string}) => item.origin === NEXTJS_LOCAL_DEV_ORIGIN,
  )
  if (hasExistingCorsOrigin) return

  try {
    const createCorsRes = await createCorsOrigin({
      allowCredentials: true,
      origin: NEXTJS_LOCAL_DEV_ORIGIN,
      projectId,
    })

    output.log(
      createCorsRes.id
        ? `Added ${NEXTJS_LOCAL_DEV_ORIGIN} to CORS origins`
        : `Failed to add ${NEXTJS_LOCAL_DEV_ORIGIN} to CORS origins`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    debug(`Error creating new CORS Origin ${NEXTJS_LOCAL_DEV_ORIGIN}: ${message}`)
    throw new InitError(`Failed to add ${NEXTJS_LOCAL_DEV_ORIGIN} to CORS origins: ${message}`, 1)
  }
}

/**
 * Legacy embed: the Studio is a catch-all route in the Next.js app, with the
 * Studio config and CLI config next to it. Only written with `--nextjs-embed-studio`.
 */
async function writeEmbeddedStudio(ctx: ScaffoldContext): Promise<string> {
  const {fileExtension, options, template, useTypeScript, workDir} = ctx

  // find source path (app or src/app)
  const appDir = 'app'
  let srcPath = path.join(workDir, appDir)
  let hasSrcFolder = false

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
      `${'../'.repeat(countNestedFolders(path.dirname(embeddedStudioRouteFilePath.slice(workDir.length))))}sanity.config`,
    ),
    workDir,
    options,
  )

  await writeOrOverwrite(
    path.join(workDir, `sanity.config.${fileExtension}`),
    sanityConfigTemplate(hasSrcFolder)
      .replace(':route:', embeddedStudioRouteFilePath.slice(workDir.length).replace('src/', ''))
      .replace(':basePath:', studioPath),
    workDir,
    options,
  )

  await writeOrOverwrite(
    path.join(workDir, `sanity.cli.${fileExtension}`),
    sanityCliTemplate,
    workDir,
    options,
  )

  await writeStudioSource({
    fileExtension,
    options,
    srcFolderPrefix: hasSrcFolder,
    template,
    useTypeScript,
    workDir,
  })
  await writeClientFiles(ctx, {srcFolderPrefix: hasSrcFolder})

  return studioPath
}
