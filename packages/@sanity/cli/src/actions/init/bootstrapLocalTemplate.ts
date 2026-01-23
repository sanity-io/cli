import fs from 'node:fs/promises'
import path from 'node:path'

import {Output, subdebug} from '@sanity/cli-core'
import {chalk, spinner} from '@sanity/cli-core/ux'
import {deburr} from 'lodash-es'

import {studioDependencies} from '../../studioDependencies.js'
import {copy} from '../../util/copy.js'
import {resolveLatestVersions} from '../../util/resolveLatestVersions.js'
import {createAppCliConfig} from './createAppCliConfig.js'
import {createCliConfig} from './createCliConfig.js'
import {createPackageManifest} from './createPackageManifest.js'
import {createStudioConfig, type GenerateConfigOptions} from './createStudioConfig.js'
import {determineAppTemplate} from './determineAppTemplate.js'
import templates from './templates/index.js'
import {type ProjectTemplate} from './types.js'
import {updateInitialTemplateMetadata} from './updateInitialTemplateMetadata.js'

const debug = subdebug('init:bootstrapRemoteTemplate')

export interface BootstrapLocalOptions {
  output: Output
  outputPath: string
  packageName: string
  templateName: string
  useTypeScript: boolean
  variables: GenerateConfigOptions['variables']

  overwriteFiles?: boolean
}

export async function bootstrapLocalTemplate(
  opts: BootstrapLocalOptions,
): Promise<ProjectTemplate> {
  const {output, outputPath, packageName, templateName, useTypeScript, variables} = opts
  // packages/@sanity/cli/src/actions/init/ -> packages/@sanity/cli/src/action -> packages/@sanity/cli/src/
  const cliRoot = path.resolve(import.meta.dirname, '../../..')
  const templatesDir = path.join(cliRoot, 'templates')
  const sourceDir = path.join(templatesDir, templateName)
  const sharedDir = path.join(templatesDir, 'shared')
  const isAppTemplate = determineAppTemplate(templateName)

  // Check that we have a template info file (dependencies, plugins etc)
  const template = templates[templateName]
  if (!template) {
    throw new Error(`Template "${templateName}" not defined`)
  }

  // Copy template files
  debug('Copying files from template "%s" to "%s"', templateName, outputPath)
  let spin = spinner('Bootstrapping files from template').start()

  debug(`Copying template from : ${sourceDir}`)
  await copy(sourceDir, outputPath, {
    rename: useTypeScript ? toTypeScriptPath : undefined,
  })
  debug(`Copying shared template code from : ${sharedDir}`)
  await copy(path.join(sharedDir, 'gitignore.txt'), outputPath, {rename: () => '.gitignore'})

  if (useTypeScript) {
    await fs.copyFile(path.join(sharedDir, 'tsconfig.json'), path.join(outputPath, 'tsconfig.json'))
  }

  spin.succeed()

  // Merge global and template-specific plugins and dependencies

  // Resolve latest versions of Sanity-dependencies
  spin = spinner('Resolving latest module versions').start()
  const dependencyVersions = await resolveLatestVersions({
    ...(isAppTemplate ? {} : studioDependencies.dependencies),
    ...(isAppTemplate ? {} : studioDependencies.devDependencies),
    ...template.dependencies,
    ...template.devDependencies,
  })
  spin.succeed()

  // Use the resolved version for the given dependency
  const dependencies: Record<string, string> = {}
  for (const dependency of Object.keys({
    ...(isAppTemplate ? {} : studioDependencies.dependencies),
    ...template.dependencies,
  })) {
    dependencies[dependency] = dependencyVersions[dependency]
  }

  const devDependencies: Record<string, string> = {}
  for (const dependency of Object.keys({
    ...(isAppTemplate ? {} : studioDependencies.devDependencies),
    ...template.devDependencies,
  })) {
    devDependencies[dependency] = dependencyVersions[dependency]
  }

  let packageJsonName: string = packageName

  /**
   * Currently app init doesn't ask for a name, so we use the last part of the path
   */
  if (isAppTemplate) {
    packageJsonName = deburr(path.basename(outputPath).toLowerCase())
      .replaceAll(/\s+/g, '-')
      .replaceAll(/[^a-z0-9-]/g, '')
  }

  // Now create a package manifest (`package.json`) with the merged dependencies
  spin = spinner('Creating default project files').start()
  const packageManifest = createPackageManifest({
    dependencies,
    devDependencies,
    isAppTemplate,
    name: packageJsonName,
    scripts: template.scripts,
  })

  // ...and a studio config (`sanity.config.[ts|js]`)
  const studioConfig = createStudioConfig({
    template: template.configTemplate,
    variables,
  })

  // ...and a CLI config (`sanity.cli.[ts|js]`)
  const cliConfig = isAppTemplate
    ? createAppCliConfig({
        entry: template.entry!,
        organizationId: variables.organizationId,
      })
    : createCliConfig({
        autoUpdates: variables.autoUpdates,
        dataset: variables.dataset,
        projectId: variables.projectId,
      })

  // Write non-template files to disc
  const codeExt = useTypeScript ? 'ts' : 'js'
  await Promise.all(
    [
      isAppTemplate
        ? Promise.resolve(null)
        : writeFileIfNotExists(`sanity.config.${codeExt}`, studioConfig),
      writeFileIfNotExists(`sanity.cli.${codeExt}`, cliConfig),
      writeFileIfNotExists('package.json', packageManifest),

      isAppTemplate
        ? Promise.resolve(null)
        : writeFileIfNotExists(
            'eslint.config.mjs',
            `import studio from '@sanity/eslint-config-studio'\n\nexport default [...studio]\n`,
          ),
    ].filter(Boolean),
  )

  debug('Updating initial template metadata')
  await updateInitialTemplateMetadata(variables.projectId, `cli-${templateName}`)

  // Finish up by providing init process with template-specific info
  spin.succeed()
  return template

  async function writeFileIfNotExists(fileName: string, content: string): Promise<void> {
    const filePath = path.join(outputPath, fileName)

    if (opts.overwriteFiles) {
      // If overwrite is enabled, just write the file
      await fs.writeFile(filePath, content)
      return
    }

    try {
      await fs.writeFile(filePath, content, {flag: 'wx'})
    } catch (err) {
      if (err.code === 'EEXIST') {
        output.warn(`\n${chalk.yellow('⚠')} File "${filePath}" already exists, skipping`)
      } else {
        throw err
      }
    }
  }
}

function toTypeScriptPath(originalPath: string): string {
  return originalPath.replace(/\.js$/, '.ts')
}
