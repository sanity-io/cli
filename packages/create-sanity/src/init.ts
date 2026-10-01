import {readdirSync, readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import path from 'node:path'
import {styleText} from 'node:util'

import deburr from 'lodash-es/deburr.js'

import {ensureAuthenticated} from './auth.js'
import {getToken} from './config.js'
import {createDatasetRequest, getOrCreateDataset} from './dataset.js'
import {type InitFlags} from './flags.js'
import {getInstallCommand, installDependencies, resolvePackageManager} from './packageManager.js'
import {runProjectCli, tryGitInit, writeStagingEnvIfNeeded} from './post.js'
import {createProjectFromName, getOrCreateProject, recordProjectInit} from './project.js'
import {bootstrapStudio, getTemplate, selectTemplate, templateDependencies} from './scaffold.js'
import {confirm, exitCodes, InitError, input, logSymbols, output} from './ui.js'
import {resolveLatestVersions} from './versions.js'

export interface InitContext {
  /** Version of `@sanity/cli` used for commands that need the full CLI */
  cliVersion: string
  interactive: boolean
  templatesDir: string
  workDir: string
}

/** Whether `dir` is a Next.js app, which `sanity init` sets up differently */
export function isNextJsProject(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return Boolean(pkg?.dependencies?.next || pkg?.devDependencies?.next)
  } catch {
    return false
  }
}

/** Studio flags `sanity init` requires when it can't prompt */
export function unattendedErrors(flags: InitFlags): string[] {
  const errors: string[] = []
  if (!flags.outputPath) {
    errors.push('Output path is required in unattended mode. Pass it with `--output-path <path>`.')
  }
  if (!flags.project && !flags.projectName) {
    errors.push(
      'Project is required in unattended mode. Pass it with `--project <id>` or `--project-name <name>`.',
    )
  }
  if (!flags.project && !flags.organization) {
    errors.push(
      'Organization is required when creating a project in unattended mode. Pass it with `--organization <id>`.',
    )
  }
  return errors
}

export function slugify(name: string): string {
  return deburr(name.toLowerCase())
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^a-z0-9-]/g, '')
}

function absolutify(dir: string): string {
  let expanded = dir
  if (dir.startsWith('~+')) expanded = path.join(process.cwd(), dir.slice(2))
  else if (dir.startsWith('~')) expanded = path.join(homedir(), dir.slice(1))
  return path.resolve(process.cwd(), expanded)
}

function validateEmptyPath(dir: string): string | true {
  try {
    return readdirSync(absolutify(dir)).length === 0 ? true : 'Given path is not empty'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
}

/** The built-in Studio initializer: same prompts, flags and files as `sanity init` */
export async function initStudio(flags: InitFlags, context: InitContext): Promise<void> {
  const {interactive, workDir} = context
  const {unattended} = flags

  if (flags.project && flags.organization) {
    throw new InitError(
      'You have specified both a project and an organization. To move a project to an organization please visit https://www.sanity.io/manage',
    )
  }
  if (unattended) {
    const errors = unattendedErrors(flags)
    if (errors.length > 0) throw new InitError(errors.join('\nError: '), exitCodes.USAGE_ERROR)
  }

  // Registry lookups don't depend on any answer, so they run while the user is prompted
  const knownTemplate = flags.template ? getTemplate(flags.template) : getTemplate('clean')
  const prefetched = resolveLatestVersions(templateDependencies(knownTemplate ?? {}))

  const user = await ensureAuthenticated({provider: flags.provider, unattended})
  output.log(`${logSymbols.success} Fetching existing projects`)
  output.log('')

  let newProject: string | undefined
  if (flags.projectName) {
    newProject = await createProjectFromName({
      name: flags.projectName,
      organization: flags.organization,
      user,
    })
    if (flags.dataset) {
      await createDatasetRequest({
        aclMode: flags.visibility,
        datasetName: flags.dataset,
        projectId: newProject,
      })
    }
  }

  const project = await getOrCreateProject({
    organization: flags.organization,
    project: flags.project ?? newProject,
    unattended,
    user,
  })
  const datasetName = await getOrCreateDataset({
    dataset: flags.dataset,
    defaultConfig: flags.datasetDefault || undefined,
    projectId: project.projectId,
    showDefaultConfigPrompt: !(
      flags.dataset ||
      flags.visibility ||
      flags.datasetDefault ||
      unattended
    ),
    unattended,
    visibility: flags.visibility,
  })

  const sluggedName = slugify(project.displayName)
  const outputPath =
    unattended || flags.outputPath
      ? flags.outputPath
        ? path.resolve(flags.outputPath)
        : workDir
      : absolutify(
          await input({
            default: path.join(workDir, sluggedName),
            message: 'Project output path:',
            validate: validateEmptyPath,
          }),
        )

  const selected = await selectTemplate(flags)
  const {template, templateName} = selected
  const shouldImport = Boolean(
    template.datasetUrl &&
    (flags.importDataset ??
      (!unattended &&
        (await confirm({
          default: true,
          message:
            template.importPrompt ||
            'This template includes a sample dataset, would you like to use it?',
        })))),
  )

  const metadata = recordProjectInit(project.projectId, templateName)
  const dependencyVersions =
    template === knownTemplate
      ? prefetched
      : prefetched.then(async (versions) => ({
          ...versions,
          ...(await resolveLatestVersions(templateDependencies(template))),
        }))

  await bootstrapStudio({
    autoUpdates: flags.autoUpdates,
    dataset: datasetName,
    dependencyVersions,
    organizationId: project.organizationId,
    outputPath,
    overwriteFiles: flags.overwriteFiles,
    packageName: sluggedName,
    projectId: project.projectId,
    projectName: project.displayName || path.basename(process.cwd()),
    selected,
    templatesDir: context.templatesDir,
  })

  const pkgManager = await resolvePackageManager({
    interactive: !unattended,
    packageManager: flags.packageManager,
    targetDir: outputPath,
  })
  if (flags.install) {
    await installDependencies(outputPath, pkgManager)
  } else {
    output.log(`Skipped dependency install. Run ${getInstallCommand(pkgManager)} to install them.`)
  }

  await writeStagingEnvIfNeeded(outputPath)
  if (flags.git !== false) tryGitInit(outputPath, flags.git)
  await metadata

  const cli = {cliVersion: context.cliVersion, interactive}
  // Editor integrations need a TTY; `--yes` configures detected editors without asking
  if (interactive && flags.mcp) {
    await runProjectCli(outputPath, ['mcp', 'configure'], {...cli, interactive: !flags.yes})
  }
  if (interactive && flags.skills) {
    await runProjectCli(outputPath, ['skills', 'install'], {...cli, interactive: !flags.yes})
  }

  if (shouldImport && template.datasetUrl) {
    const token = getToken()
    if (!token) throw new InitError('Authentication required to import dataset')
    const code = await runProjectCli(
      outputPath,
      [
        'datasets',
        'import',
        template.datasetUrl,
        '--project-id',
        project.projectId,
        '--dataset',
        datasetName,
        '--token',
        token,
        '--missing',
      ],
      cli,
    )
    if (code !== 0) throw new InitError('Dataset import failed', code)
    output.log('')
    output.log('If you want to delete the imported data, use')
    output.log(`  ${styleText('cyan', `npx sanity dataset delete ${datasetName}`)}`)
    output.log('and create a new clean dataset with')
    output.log(`  ${styleText('cyan', `npx sanity dataset create <name>`)}\n`)
  }

  const devCommand = {
    bun: 'bun dev',
    manual: 'npm run dev',
    npm: 'npm run dev',
    pnpm: 'pnpm dev',
    yarn: 'yarn dev',
  }[pkgManager]
  output.log(`✅ ${styleText(['green', 'bold'], 'Success!')} Your Studio has been created.`)
  if (outputPath !== workDir) {
    output.log(
      `\n(${styleText('cyan', `cd ${outputPath}`)} to navigate to your new project directory)`,
    )
  }
  const startupCommands = flags.install
    ? styleText('cyan', devCommand)
    : `${styleText('cyan', getInstallCommand(pkgManager))}, then ${styleText('cyan', devCommand)}`
  output.log(
    `\nGet started by running ${startupCommands} to launch your Studio's development server`,
  )
  output.log('\n')
  output.log(`Other helpful commands:`)
  output.log(`npx sanity docs browse     to open the documentation in a browser`)
  output.log(`npx sanity manage          to open the project settings in a browser`)
  output.log(`npx sanity help            to explore the CLI manual`)
  if (project.isFirstProject) {
    output.log(
      `\nJoin the Sanity community: ${styleText('cyan', 'https://www.sanity.io/community/join')}`,
    )
    output.log('We look forward to seeing you there!\n')
  }
}
