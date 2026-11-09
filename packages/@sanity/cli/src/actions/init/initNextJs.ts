import {existsSync} from 'node:fs'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {type Output, subdebug, type TelemetryUserProperties} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {type TelemetryTrace} from '@sanity/telemetry'
import {execa, type Options} from 'execa'

import {
  promptForAppendEnv,
  promptForNextTemplate,
  promptForStudioPath,
} from '../../prompts/init/nextjs.js'
import {promptForTypeScript} from '../../prompts/init/promptForTypescript.js'
import {createCorsOrigin, listCorsOrigins} from '../../services/cors.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {getPeerDependencies} from '../../util/packageManager/getPeerDependencies.js'
import {getAddCommand, installNewPackages} from '../../util/packageManager/installPackages.js'
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
  standaloneSanityCliTemplate,
  standaloneSanityConfigTemplate,
} from './templates/nextjs/index.js'
import {type InitOptions, type VersionedFramework} from './types.js'

const debug = subdebug('init')

const NEXT_SANITY_PACKAGE = 'next-sanity@13'

const STUDIO_SCRIPTS = {
  studio: 'sanity dev',
  'studio:build': 'sanity build studio-static',
  'studio:deploy': 'sanity deploy',
} as const

const STUDIO_TSCONFIG_EXCLUDES = ['.sanity', 'studio-static']

const STUDIO_GITIGNORE_ENTRIES = [
  {line: '.sanity/', name: '.sanity'},
  {line: 'studio-static/', name: 'studio-static'},
]

async function writeOrOverwrite(
  filePath: string,
  content: string,
  workDir: string,
  options: InitOptions,
) {
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
}) {
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
  output: Output
  projectId: string
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  workDir: string
}): Promise<void> {
  const {
    autoUpdates,
    install,
    nextjsAppendEnv,
    nextjsEmbedStudio,
    packageManager,
    template,
    typescript,
    unattended,
  } = options
  let useTypeScript = flagOrDefault(typescript, true)
  if (shouldPrompt(unattended, typescript)) {
    useTypeScript = await promptForTypeScript()
  }
  trace.log({
    selectedOption: useTypeScript ? 'yes' : 'no',
    step: 'useTypeScript',
  })

  const fileExtension = useTypeScript ? 'ts' : 'js'
  // Omitted and `--no-nextjs-embed-studio` add a Studio that runs separately.
  // Only the explicit flag keeps the legacy Next.js route.
  const embeddedStudio = nextjsEmbedStudio === true
  let hasSrcFolder = false
  let studioRoute: string | undefined

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

    const studioPath = unattended ? '/studio' : await promptForStudioPath()
    studioRoute = studioPath

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

    const sanityConfigPath = path.join(workDir, `sanity.config.${fileExtension}`)
    await writeOrOverwrite(
      sanityConfigPath,
      sanityConfigTemplate(hasSrcFolder)
        .replace(':route:', embeddedStudioRouteFilePath.slice(workDir.length).replace('src/', ''))
        .replace(':basePath:', studioPath),
      workDir,
      options,
    )
  } else {
    const sanityConfigPath = path.join(workDir, `sanity.config.${fileExtension}`)
    await writeOrOverwrite(
      sanityConfigPath,
      standaloneSanityConfigTemplate(projectId, datasetName),
      workDir,
      options,
    )
    await writeOrOverwrite(path.join(workDir, 'sanity', 'static', '.gitkeep'), '', workDir, options)
  }

  const sanityCliPath = path.join(workDir, `sanity.cli.${fileExtension}`)
  await writeOrOverwrite(
    sanityCliPath,
    embeddedStudio
      ? sanityCliTemplate
      : standaloneSanityCliTemplate(autoUpdates, projectId, datasetName),
    workDir,
    options,
  )

  let templateToUse = template ?? 'clean'
  if (shouldPrompt(unattended, template)) {
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

  let appendEnv = flagOrDefault(nextjsAppendEnv, true)
  if (shouldPrompt(unattended, nextjsAppendEnv)) {
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
      const message = error instanceof Error ? error.message : String(error)
      debug(`Error creating new CORS Origin ${nextjsLocalDevOrigin}: ${message}`)
      throw new InitError(`Failed to add ${nextjsLocalDevOrigin} to CORS origins: ${message}`, 1)
    }
  }

  if (!embeddedStudio) {
    await addStudioScripts({options, output, workDir})
    await excludeStudioOutputFromTsconfig({output, workDir})
    await appendStudioGitignore(workDir)
  }

  const chosen = await resolvePackageManager({
    interactive: !unattended,
    output,
    packageManager: packageManager as PackageManager,
    targetDir: workDir,
  })
  trace.log({selectedOption: chosen, step: 'selectPackageManager'})
  const packages = ['@sanity/vision@5', 'sanity@5', '@sanity/image-url@2', 'styled-components@6']
  if (templateToUse === 'blog') {
    packages.push('@sanity/icons@5')
  }

  if (install) {
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
      case 'npm': {
        await execa('npm', ['install', NEXT_SANITY_PACKAGE], execOptions)
        break
      }
      case 'pnpm': {
        await execa('pnpm', ['install', NEXT_SANITY_PACKAGE], execOptions)
        break
      }
      case 'yarn': {
        const peerDeps = await getPeerDependencies(NEXT_SANITY_PACKAGE, workDir)
        await installNewPackages(
          {packageManager: 'yarn', packages: [NEXT_SANITY_PACKAGE, ...peerDeps]},
          {output, workDir},
        )
        break
      }
      default: {
        // bun and manual - do nothing or handle differently
        break
      }
    }
  } else {
    // Unlike the studio templates, none of this is declared in a scaffolded
    // package.json - the packages only land by way of the package manager - so
    // name them rather than pointing at a bare install.
    output.log(
      `Skipped dependency install. Run ${getAddCommand(chosen, [...packages, NEXT_SANITY_PACKAGE])} to add them.`,
    )
  }

  if (embeddedStudio) {
    output.log(`\n${styleText('green', 'Added Sanity to this project.')}`)
    output.log(`The Studio is a route in the Next.js app at ${studioRoute}.`)
    output.log(`Start the app with \`${scriptCommand(chosen, 'dev')}\`.`)
  } else {
    output.log(`\n${styleText('green', 'Added a Sanity Studio to this project.')}`)
    output.log('The Next.js app and the Studio run on separate dev servers.')
    output.log(`Start the app with \`${scriptCommand(chosen, 'dev')}\`.`)
    output.log(`Start the Studio with \`${scriptCommand(chosen, 'studio')}\`.`)
  }
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

function scriptCommand(packageManager: PackageManager, script: string): string {
  if (packageManager === 'yarn' || packageManager === 'pnpm' || packageManager === 'bun') {
    return `${packageManager} ${script}`
  }

  return `npm run ${script}`
}

function detectIndent(source: string): string {
  return source.match(/\n([ \t]+)\S/)?.[1] ?? '  '
}

async function addStudioScripts({
  options,
  output,
  workDir,
}: {
  options: InitOptions
  output: Output
  workDir: string
}): Promise<void> {
  const pkgPath = path.join(workDir, 'package.json')
  if (!existsSync(pkgPath)) {
    output.warn(
      'No package.json found. Add a "studio" script that runs `sanity dev`, plus "studio:build" (`sanity build studio-static`) and "studio:deploy" (`sanity deploy`).',
    )
    return
  }

  const raw = await readFile(pkgPath, 'utf8')
  let pkg: {scripts?: Record<string, string>}
  try {
    pkg = JSON.parse(raw) as {scripts?: Record<string, string>}
  } catch {
    output.warn(
      'Couldn\'t update package.json. Add a "studio" script that runs `sanity dev`, plus "studio:build" (`sanity build studio-static`) and "studio:deploy" (`sanity deploy`).',
    )
    return
  }

  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    output.warn(
      'Couldn\'t update package.json. Add a "studio" script that runs `sanity dev`, plus "studio:build" (`sanity build studio-static`) and "studio:deploy" (`sanity deploy`).',
    )
    return
  }

  pkg.scripts ??= {}
  const scripts = pkg.scripts
  let changed = false

  for (const [name, command] of Object.entries(STUDIO_SCRIPTS)) {
    const existing = scripts[name]
    if (existing === undefined || existing === command) {
      if (existing !== command) {
        scripts[name] = command
        changed = true
      }
      continue
    }

    let overwrite = flagOrDefault(options.overwriteFiles, false)
    if (shouldPrompt(options.unattended, options.overwriteFiles)) {
      overwrite = await confirm({
        default: false,
        message: `Script ${name} already exists. Overwrite it with \`${command}\`?`,
      })
    }

    if (overwrite) {
      scripts[name] = command
      changed = true
    } else {
      output.warn(
        `Script "${name}" already exists. Left \`${existing}\` in place. The Studio uses \`${command}\`.`,
      )
    }
  }

  if (!changed) return

  await writeFile(pkgPath, `${JSON.stringify(pkg, null, detectIndent(raw))}\n`)
}

async function excludeStudioOutputFromTsconfig({
  output,
  workDir,
}: {
  output: Output
  workDir: string
}): Promise<void> {
  const tsconfigPath = path.join(workDir, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return

  const raw = await readFile(tsconfigPath, 'utf8')
  let tsconfig: {exclude?: unknown}
  try {
    tsconfig = JSON.parse(raw) as {exclude?: unknown}
  } catch {
    output.warn(
      'Couldn\'t update tsconfig.json. Add ".sanity" and "studio-static" to exclude so TypeScript skips Studio build output.',
    )
    return
  }

  if (!tsconfig || typeof tsconfig !== 'object' || Array.isArray(tsconfig)) {
    output.warn(
      'Couldn\'t update tsconfig.json. Add ".sanity" and "studio-static" to exclude so TypeScript skips Studio build output.',
    )
    return
  }

  const exclude = Array.isArray(tsconfig.exclude)
    ? tsconfig.exclude.filter((entry): entry is string => typeof entry === 'string')
    : []
  let changed = false
  for (const entry of STUDIO_TSCONFIG_EXCLUDES) {
    if (!exclude.includes(entry)) {
      exclude.push(entry)
      changed = true
    }
  }

  if (!changed) return

  tsconfig.exclude = exclude
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, detectIndent(raw))}\n`)
}

function gitignoreCovers(lines: string[], name: string): boolean {
  return lines.some((line) => {
    const trimmed = line.trim()
    return (
      trimmed === name ||
      trimmed === `/${name}` ||
      trimmed === `${name}/` ||
      trimmed === `/${name}/`
    )
  })
}

async function appendStudioGitignore(workDir: string): Promise<void> {
  const gitignorePath = path.join(workDir, '.gitignore')
  if (!existsSync(gitignorePath)) return

  const raw = await readFile(gitignorePath, 'utf8')
  const lines = raw.split('\n')
  const missing = STUDIO_GITIGNORE_ENTRIES.filter((entry) => !gitignoreCovers(lines, entry.name))
  if (missing.length === 0) return

  const separator = raw.endsWith('\n') || raw.length === 0 ? '' : '\n'
  const block = `${separator}\n# Sanity Studio\n${missing.map((entry) => entry.line).join('\n')}\n`
  await writeFile(gitignorePath, `${raw}${block}`)
}
