import fs from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {toAppSlug} from '@sanity/workbench-cli/init'

// Template definitions and file generators are plain data and string builders,
// shared with `sanity init` and bundled at build time.
import {createCliConfig} from '../../@sanity/cli/src/actions/init/createCliConfig.js'
import {createPackageManifest} from '../../@sanity/cli/src/actions/init/createPackageManifest.js'
import {createStudioConfig} from '../../@sanity/cli/src/actions/init/createStudioConfig.js'
import {studioDependencies} from '../../@sanity/cli/src/actions/init/studioDependencies.js'
import templates from '../../@sanity/cli/src/actions/init/templates/index.js'
import {type ProjectTemplate} from '../../@sanity/cli/src/actions/init/types.js'
import {confirm, InitError, output, select, spinner} from './ui.js'

const templateChoices = [
  {name: 'Clean project with no predefined schema types', value: 'clean'},
  {name: 'Blog (schema)', value: 'blog'},
  {name: 'E-commerce (Shopify)', value: 'shopify'},
  {name: 'Movie project (schema + sample data)', value: 'moviedb'},
  {name: 'Page Builder (presets)', value: 'page-builder'},
]

export interface SelectedTemplate {
  template: ProjectTemplate
  templateName: string
  useTypeScript: boolean
}

export function getTemplate(name: string): ProjectTemplate | undefined {
  return templates[name]
}

export async function selectTemplate(options: {
  template?: string
  typescript?: boolean
  unattended: boolean
}): Promise<SelectedTemplate> {
  const {typescript, unattended} = options
  const templateName =
    unattended || options.template
      ? options.template || 'clean'
      : await select({choices: templateChoices, message: 'Select project template'})
  const template = templates[templateName]
  if (!template) throw new InitError(`Template "${templateName}" not found`)

  let useTypeScript = typeof typescript === 'boolean' ? typescript : true
  if (template.typescriptOnly === true) {
    useTypeScript = true
  } else if (!unattended && typescript === undefined) {
    useTypeScript = await confirm({default: true, message: 'Do you want to use TypeScript?'})
  }
  return {template, templateName, useTypeScript}
}

/** Every dependency a Studio template declares, with `latest` ranges still unresolved */
export function templateDependencies(template: ProjectTemplate): Record<string, string> {
  return {
    ...studioDependencies.dependencies,
    ...studioDependencies.devDependencies,
    ...template.dependencies,
    ...template.devDependencies,
  }
}

/** Copy a directory recursively, optionally renaming files */
async function copyDir(src: string, dst: string, rename?: (name: string) => string): Promise<void> {
  const entries = await fs.readdir(src, {recursive: true, withFileTypes: true})
  const dirs = new Set<string>([dst])
  for (const entry of entries) {
    const rel = path.relative(src, path.join(entry.parentPath, entry.name))
    if (entry.isDirectory()) dirs.add(path.join(dst, rel))
  }
  for (const dir of [...dirs].toSorted()) await fs.mkdir(dir, {recursive: true})
  await Promise.all(
    entries
      .filter((entry) => !entry.isDirectory())
      .map((entry) => {
        const rel = path.relative(src, entry.parentPath)
        const name = rename ? rename(entry.name) : entry.name
        return fs.copyFile(path.join(entry.parentPath, entry.name), path.join(dst, rel, name))
      }),
  )
}

/**
 * Write a local Studio template to `outputPath`: template files, then
 * `package.json`, Studio and CLI configs, with dependency versions resolved
 * from the registry. Mirrors `sanity init`'s local template bootstrap.
 */
export async function bootstrapStudio(options: {
  autoUpdates: boolean
  dataset: string
  /** Version lookups, started early so they overlap the prompts */
  dependencyVersions: Promise<Record<string, string>>
  organizationId: string | undefined
  outputPath: string
  overwriteFiles: boolean | undefined
  packageName: string
  projectId: string
  projectName: string
  selected: SelectedTemplate
  templatesDir: string
}): Promise<void> {
  const {outputPath, selected} = options
  const {template, templateName, useTypeScript} = selected
  const sharedDir = path.join(options.templatesDir, 'shared')

  let spin = spinner('Bootstrapping files from template').start()
  await copyDir(
    path.join(options.templatesDir, templateName),
    outputPath,
    useTypeScript ? (name) => name.replace(/\.js$/, '.ts') : undefined,
  )
  await Promise.all([
    fs.copyFile(path.join(sharedDir, 'gitignore.txt'), path.join(outputPath, '.gitignore')),
    useTypeScript
      ? fs.copyFile(path.join(sharedDir, 'tsconfig.json'), path.join(outputPath, 'tsconfig.json'))
      : undefined,
  ])
  spin.succeed()

  spin = spinner('Resolving latest module versions').start()
  const versions = await options.dependencyVersions
  spin.succeed()

  const pick = (names: Record<string, string>) =>
    Object.fromEntries(Object.keys(names).map((name) => [name, versions[name]]))
  const dependencies = pick({...studioDependencies.dependencies, ...template.dependencies})
  const devDependencies = pick({...studioDependencies.devDependencies, ...template.devDependencies})

  const title = options.projectName || options.packageName
  spin = spinner('Creating default project files').start()
  const variables = {
    autoUpdates: options.autoUpdates,
    dataset: options.dataset,
    organizationId: options.organizationId,
    projectId: options.projectId,
    projectName: options.projectName,
    workbench: false,
  }
  const files: [string, string][] = [
    [
      `sanity.config.${useTypeScript ? 'ts' : 'js'}`,
      createStudioConfig({template: template.configTemplate, variables}),
    ],
    [
      `sanity.cli.${useTypeScript ? 'ts' : 'js'}`,
      createCliConfig({
        autoUpdates: options.autoUpdates,
        dataset: options.dataset,
        isWorkbenchApp: false,
        organizationId: options.organizationId,
        projectId: options.projectId,
        slug: toAppSlug(title) ?? 'sanity-app',
        title,
      }),
    ],
    [
      'package.json',
      createPackageManifest({
        dependencies,
        devDependencies,
        name: options.packageName,
        scripts: template.scripts,
        type: template.type,
      }),
    ],
    [
      'eslint.config.mjs',
      `import studio from '@sanity/eslint-config-studio'\n\nexport default [...studio]\n`,
    ],
  ]
  await Promise.all(
    files.map(async ([name, content]) => {
      const filePath = path.join(outputPath, name)
      if (options.overwriteFiles) {
        await fs.writeFile(filePath, content)
        return
      }
      try {
        await fs.writeFile(filePath, content, {flag: 'wx'})
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        output.warn(`\n${styleText('yellow', '⚠')} File "${filePath}" already exists, skipping`)
      }
    }),
  )
  spin.succeed()
}
