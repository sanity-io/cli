import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {ProjectRootNotFoundError} from '@sanity/cli-core/errors'
import {SanityCommand} from '@sanity/cli-core/SanityCommand'

import {
  gatherAuthInfo,
  gatherCliInfo,
  gatherProjectInfo,
  gatherResolvedWorkspaces,
  gatherStudioWorkspaces,
  gatherUserInfo,
} from '../actions/debug/gatherDebugInfo.js'
import {formatKeyValue, sectionHeader} from '../actions/debug/output.js'
import {type StudioWorkspace, type UserInfo} from '../actions/debug/types.js'

type ConfigLoadResult<T> = {error: Error; value?: never} | {error?: never; value: T}

export class Debug extends SanityCommand<typeof Debug> {
  static override description = 'Print diagnostic info for troubleshooting'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --secrets',
  ]

  static override flags = {
    secrets: Flags.boolean({
      default: false,
      description: 'Include API keys in output',
    }),
    verbose: Flags.boolean({
      default: false,
      description: 'Show full error details including stack traces',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = this

    let projectDirectory: string | undefined
    try {
      const projectRoot = await this.getProjectRoot()
      projectDirectory = projectRoot.directory
    } catch (err) {
      if (!(err instanceof ProjectRootNotFoundError)) throw err
    }

    // Try loading CLI config, capturing errors
    let cliConfigLoad: ConfigLoadResult<Awaited<ReturnType<typeof this.getCliConfig>>> | undefined
    if (projectDirectory) {
      try {
        cliConfigLoad = {value: await this.getCliConfig()}
      } catch (err) {
        cliConfigLoad = {error: err instanceof Error ? err : new Error(String(err))}
      }
    }

    const projectId = cliConfigLoad?.value?.api?.projectId

    // Gather project info once, shared between Project and Studio sections
    const project = projectDirectory ? await gatherProjectInfo(projectDirectory) : undefined

    // Pre-load studio workspaces so we know if the config is valid
    let studioLoad: ConfigLoadResult<StudioWorkspace[]> | undefined
    if (project?.studioConfigPath && projectDirectory) {
      try {
        studioLoad = {value: await gatherStudioWorkspaces(projectDirectory)}
      } catch (err) {
        studioLoad = {error: err instanceof Error ? err : new Error(String(err))}
      }
    }

    // Section 1: User
    const user = await this.printUserSection(projectId)
    const userId = user instanceof Error ? undefined : user.id

    // Section 2: Authentication (only when logged in)
    await this.printAuthSection(flags.secrets)

    // Section 3: CLI
    await this.printCliSection()

    // Section 4: Project
    this.printProjectSection(project, cliConfigLoad, studioLoad)

    // Section 5: Studio (when studio config file exists)
    if (projectDirectory && project?.studioConfigPath && studioLoad) {
      await this.printStudioSection(projectDirectory, studioLoad, flags.verbose, projectId, userId)
    }
  }

  private async printAuthSection(includeSecrets: boolean): Promise<void> {
    const auth = await gatherAuthInfo(includeSecrets)
    if (!auth.hasToken) return

    this.output.log(sectionHeader('Authentication'))
    const padTo = 10 // "Auth token" is the longest key
    this.output.log(formatKeyValue('Auth token', auth.authToken, {padTo}))
    this.output.log(formatKeyValue('User type', auth.userType, {padTo}))

    if (!includeSecrets) {
      this.output.log('  (run with --secrets to reveal token)')
    }
    this.output.log('')
  }

  private async printCliSection(): Promise<void> {
    this.output.log(sectionHeader('CLI'))

    try {
      const cliInfo = await gatherCliInfo()
      const padTo = 9 // "Installed" is the longest key
      this.output.log(formatKeyValue('Version', cliInfo.version, {padTo}))
      this.output.log(formatKeyValue('Installed', cliInfo.installContext, {padTo}))
    } catch {
      this.output.log(`  ${styleText('red', 'Unable to determine CLI version')}`)
    }
    this.output.log('')
  }

  private printConfigStatus(
    label: string,
    fileName: string | undefined,
    loadResult: ConfigLoadResult<unknown> | undefined,
    padTo: number,
  ): void {
    if (!fileName) {
      this.output.log(formatKeyValue(label, `${styleText('red', '\u274C')} not found`, {padTo}))
      return
    }

    if (loadResult?.error) {
      this.output.log(
        formatKeyValue(
          label,
          `${styleText('yellow', '\u26A0\uFE0F')}  ${styleText('yellow', fileName)} (has errors)`,
          {padTo},
        ),
      )
    } else {
      this.output.log(
        formatKeyValue(label, `${styleText('green', '\u2705')} ${styleText('yellow', fileName)}`, {
          padTo,
        }),
      )
    }
  }

  private printProjectSection(
    project: Awaited<ReturnType<typeof gatherProjectInfo>>,
    cliConfigLoad: ConfigLoadResult<unknown> | undefined,
    studioLoad: ConfigLoadResult<unknown> | undefined,
  ): void {
    this.output.log(sectionHeader('Project'))

    if (!project) {
      this.output.log('  No project found\n')
      return
    }

    const padTo = 14
    this.output.log(formatKeyValue('Root path', project.rootPath, {padTo}))
    this.printConfigStatus('CLI config', project.cliConfigPath, cliConfigLoad, padTo)
    this.printConfigStatus('Studio config', project.studioConfigPath, studioLoad, padTo)
    this.output.log('')
  }

  private async printStudioSection(
    projectDirectory: string,
    studioLoad: ConfigLoadResult<StudioWorkspace[]>,
    verbose: boolean,
    projectId: string | undefined,
    userId: string | undefined,
  ): Promise<void> {
    this.output.log(sectionHeader('Studio'))

    if (studioLoad.error) {
      this.output.log(`  ${styleText('red', 'Failed to load studio configuration:')}`)
      if (verbose) {
        this.output.log(`  ${studioLoad.error.stack ?? studioLoad.error.message}\n`)
      } else {
        this.output.log(`  ${truncate(studioLoad.error.message)}\n`)
      }
      return
    }

    this.output.log('  Workspaces:')
    for (const ws of studioLoad.value) {
      const label = ws.name ?? 'default'
      this.output.log(`    ${label}`)
      this.output.log(formatKeyValue('Project ID', ws.projectId, {indent: 6, padTo: 10}))
      this.output.log(formatKeyValue('Dataset', ws.dataset, {indent: 6, padTo: 10}))
    }

    // Full resolution: try to resolve plugins and get roles
    try {
      const resolved = await gatherResolvedWorkspaces(projectDirectory, userId)

      this.output.log('')
      this.output.log('  Resolved configuration:')
      for (const ws of resolved) {
        this.output.log(`    ${ws.name} (${ws.title})`)
        if (ws.roles.length > 0) {
          this.output.log(formatKeyValue('Roles', ws.roles, {indent: 6, padTo: 5}))
        }
      }
    } catch (err) {
      this.output.log('')
      if (verbose && err instanceof Error && err.stack) {
        this.output.log(`  ${styleText('dim', 'Unable to resolve full studio configuration:')}`)
        this.output.log(`  ${styleText('dim', err.stack)}`)
      } else {
        const reason = truncate(err instanceof Error ? err.message : String(err))
        this.output.log(
          `  ${styleText('dim', `(unable to resolve full studio configuration: ${reason})`)}`,
        )
      }
    }
    this.output.log('')
  }

  private async printUserSection(projectId: string | undefined): Promise<Error | UserInfo> {
    this.output.log(`\n${sectionHeader('User')}`)

    const user = await gatherUserInfo(projectId)
    if (user instanceof Error) {
      this.output.log(`  ${user.message}\n`)
      return user
    }

    const padTo = 8 // "Provider" is the longest key
    this.output.log(formatKeyValue('Name', user.name, {padTo}))
    this.output.log(formatKeyValue('Email', user.email, {padTo}))
    this.output.log(formatKeyValue('ID', user.id, {padTo}))
    this.output.log(formatKeyValue('Provider', user.provider, {padTo}))
    this.output.log('')
    return user
  }
}

const MAX_ERROR_LENGTH = 200

function truncate(str: string): string {
  const collapsed = str.replaceAll(/\s*\n\s*/g, ' ').trim()
  if (collapsed.length <= MAX_ERROR_LENGTH) return collapsed
  return `${collapsed.slice(0, MAX_ERROR_LENGTH)}...`
}
