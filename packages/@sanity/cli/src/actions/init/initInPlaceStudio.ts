import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {type Output, type TelemetryUserProperties} from '@sanity/cli-core'
import {type TelemetryTrace} from '@sanity/telemetry'

import {promptForNextTemplate} from '../../prompts/init/nextjs.js'
import {promptForTypeScript} from '../../prompts/init/promptForTypescript.js'
import {type InitStepResult} from '../../telemetry/init.telemetry.js'
import {getPeerDependencies} from '../../util/packageManager/getPeerDependencies.js'
import {getAddCommand, installNewPackages} from '../../util/packageManager/installPackages.js'
import {type PackageManager} from '../../util/packageManager/packageManagerChoice.js'
import {type EditorName} from '../mcp/editorConfigs.js'
import {getFrameworkScaffold} from './frameworkScaffolds/index.js'
import {type ScaffoldContext} from './frameworkScaffolds/types.js'
import {
  flagOrDefault,
  getPostInitMCPPrompt,
  shouldPrompt,
  writeStagingEnvIfNeeded,
} from './initHelpers.js'
import {
  scriptCommand,
  updateStudioProjectFiles,
  writeInPlaceStudioConfig,
  writeStudioSource,
} from './inPlaceStudioBase.js'
import {resolvePackageManager} from './resolvePackageManager.js'
import {type InitOptions, type VersionedFramework} from './types.js'

/**
 * Adds a Studio to the current project. The Studio files are the same
 * for every framework. A framework scaffold, when one exists, adds the client
 * files, env handling, and dev origin for that app.
 */
export async function initInPlaceStudio({
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
    nextjsEmbedStudio,
    packageManager,
    template,
    typescript,
    unattended,
  } = options
  const scaffold = getFrameworkScaffold(detectedFramework)

  const embedStudio = nextjsEmbedStudio === true ? scaffold?.writeEmbeddedStudio : undefined
  if (nextjsEmbedStudio === true && !embedStudio) {
    const target = detectedFramework ? ` to ${detectedFramework.name}` : ''
    output.warn(
      `--nextjs-embed-studio is only available for Next.js projects. Adding a Studio${target} instead.`,
    )
  }

  let useTypeScript = flagOrDefault(typescript, true)
  if (shouldPrompt(unattended, typescript)) {
    useTypeScript = await promptForTypeScript()
  }
  trace.log({
    selectedOption: useTypeScript ? 'yes' : 'no',
    step: 'useTypeScript',
  })

  const fileExtension = useTypeScript ? 'ts' : 'js'

  let studioTemplate: 'blog' | 'clean' = template === 'blog' ? 'blog' : 'clean'
  if (shouldPrompt(unattended, template)) {
    studioTemplate = await promptForNextTemplate()
  }

  const ctx: ScaffoldContext = {
    datasetName,
    envFilename,
    fileExtension,
    framework: detectedFramework,
    options,
    output,
    projectId,
    template: studioTemplate,
    trace,
    useTypeScript,
    workDir,
  }

  let studioRoute: string | undefined
  if (embedStudio) {
    studioRoute = await embedStudio(ctx)
  } else {
    await writeInPlaceStudioConfig({
      autoUpdates,
      datasetName,
      fileExtension,
      options,
      projectId,
      workDir,
    })
    await writeStudioSource({
      fileExtension,
      options,
      template: studioTemplate,
      useTypeScript,
      workDir,
    })
    await scaffold?.writeClientFiles(ctx, {srcFolderPrefix: false})
  }

  if (scaffold) {
    await scaffold.appendEnv(ctx)
    await scaffold.allowDevOrigin(ctx)
  }

  if (!studioRoute) {
    await updateStudioProjectFiles({options, output, workDir})
  }

  const chosen = await resolvePackageManager({
    interactive: !unattended,
    output,
    packageManager: packageManager as PackageManager,
    targetDir: workDir,
  })
  trace.log({selectedOption: chosen, step: 'selectPackageManager'})

  const packages = [
    '@sanity/vision@6',
    'sanity@6',
    'styled-components@6',
    // Studio requires React. Next.js, Remix, and React Router already depend on
    // it; Astro and Nuxt do not, and Yarn does not install peer dependencies.
    ...(await missingReactPackages(workDir)),
    ...(scaffold?.packages ?? []),
  ]
  if (studioTemplate === 'blog') {
    packages.push('@sanity/icons@5')
  }
  const clientPackages = scaffold ? [scaffold.clientPackage] : []

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

    if (scaffold) {
      await installClientPackage({
        chosen,
        clientPackage: scaffold.clientPackage,
        output,
        workDir,
      })
    }
  } else {
    // None of this is declared in a scaffolded package.json, so the packages only
    // land by way of the package manager. Name them rather than pointing at a bare install.
    output.log(
      `Skipped dependency install. Run ${getAddCommand(chosen, [...packages, ...clientPackages])} to add them.`,
    )
  }

  const appLabel = detectedFramework ? `The ${detectedFramework.name} app` : 'The app'
  if (studioRoute) {
    output.log(`\n${styleText('green', 'Added Sanity to this project.')}`)
    output.log(`The Studio is a route in ${appLabel.replace(/^The /, 'the ')} at ${studioRoute}.`)
    output.log(`Start the app with \`${scriptCommand(chosen, 'dev')}\`.`)
  } else {
    output.log(`\n${styleText('green', 'Added a Sanity Studio to this project.')}`)
    output.log(`${appLabel} and the Studio run on separate dev servers.`)
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

const REACT_PACKAGES = [
  ['react', 'react@19'],
  ['react-dom', 'react-dom@19'],
] as const

/** React packages the app does not already declare. Studio needs both. */
async function missingReactPackages(workDir: string): Promise<string[]> {
  const declared = await declaredDependencyNames(workDir)
  return REACT_PACKAGES.filter(([name]) => !declared.has(name)).map(([, spec]) => spec)
}

async function declaredDependencyNames(workDir: string): Promise<Set<string>> {
  try {
    const raw = await readFile(path.join(workDir, 'package.json'), 'utf8')
    const pkg: unknown = JSON.parse(raw)
    if (!isRecord(pkg)) return new Set()

    const names = new Set<string>()
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const deps = pkg[field]
      if (!isRecord(deps)) continue
      for (const name of Object.keys(deps)) names.add(name)
    }
    return names
  } catch {
    return new Set()
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Installs the framework's client package. `next-sanity` has peer dependencies,
 * so each package manager gets its own command.
 */
async function installClientPackage({
  chosen,
  clientPackage,
  output,
  workDir,
}: {
  chosen: PackageManager
  clientPackage: string
  output: Output
  workDir: string
}): Promise<void> {
  switch (chosen) {
    case 'npm':
    case 'pnpm':
    case 'yarn': {
      // yarn does not auto-install peer dependencies, so list them explicitly.
      // npm and pnpm install them on their own.
      const peerDeps = chosen === 'yarn' ? await getPeerDependencies(clientPackage, workDir) : []
      // Through the shared installer, so pnpm's skipped build scripts are not fatal.
      await installNewPackages(
        {packageManager: chosen, packages: [clientPackage, ...peerDeps]},
        {output, workDir},
      )
      break
    }
    default: {
      // bun and manual - nothing to do
      break
    }
  }
}
