import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {ProjectRootNotFoundError, SanityCommand} from '@sanity/cli-core'

import {
  gatherAuthInfo,
  gatherCliInfo,
  gatherProjectInfo,
  gatherResolvedWorkspaces,
  gatherStudioWorkspaces,
  gatherUserInfo,
} from '../actions/debug/gatherDebugInfo.js'
import {formatKeyValue, sectionHeader} from '../actions/debug/output.js'
import {type StudioWorkspace} from '../actions/debug/types.js'

interface ConfigLoadResult<T> {
  error?: Error
  value?: T
}

export class Debug extends SanityCommand<typeof Debug> {
  static override description = 'Provides diagnostic info for Sanity Studio troubleshooting'

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
    await this.printUserSection(projectId)

    // Section 2: Authentication (only when logged in)
    await this.printAuthSection(flags.secrets)

    // Section 3: CLI
    await this.printCliSection()

    // Section 4: Project
    this.printProjectSection(project, cliConfigLoad, studioLoad)

    // Section 5: Studio (when studio config file exists)
    if (projectDirectory && project?.studioConfigPath && studioLoad) {
      await this.printStudioSection(projectDirectory, studioLoad, flags.verbose)
    }
  }

  private async printAuthSection(includeSecrets: boolean): Promise<void> {
    const auth = await gatherAuthInfo(includeSecrets)
    if (!auth.hasToken) return

    this.log(sectionHeader('Authentication'))
    const padTo = 10 // "Auth token" is the longest key
    this.log(formatKeyValue('Auth token', auth.authToken, {padTo}))
    this.log(formatKeyValue('User type', auth.userType, {padTo}))

    if (!includeSecrets) {
      this.log('  (run with --secrets to reveal token)')
    }
    this.log('')
  }

  private async printCliSection(): Promise<void> {
    this.log(sectionHeader('CLI'))

    try {
      const cliInfo = await gatherCliInfo()
      const padTo = 9 // "Installed" is the longest key
      this.log(formatKeyValue('Version', cliInfo.version, {padTo}))
      this.log(formatKeyValue('Installed', cliInfo.installContext, {padTo}))
    } catch {
      this.log(`  ${styleText('red', 'Unable to determine CLI version')}`)
    }
    this.log('')
  }

  private printConfigStatus(
    label: string,
    fileName: string | undefined,
    loadResult: ConfigLoadResult<unknown> | undefined,
    padTo: number,
  ): void {
    if (!fileName) {
      this.log(formatKeyValue(label, `${styleText('red', '\u274C')} not found`, {padTo}))
      return
    }

    if (loadResult?.error) {
      this.log(
        formatKeyValue(
          label,
          `${styleText('yellow', '\u26A0\uFE0F')}  ${styleText('yellow', fileName)} (has errors)`,
          {padTo},
        ),
      )
    } else {
      this.log(
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
    this.log(sectionHeader('Project'))

    if (!project) {
      this.log('  No project found\n')
      return
    }

    const padTo = 14
    this.log(formatKeyValue('Root path', project.rootPath, {padTo}))
    this.printConfigStatus('CLI config', project.cliConfigPath, cliConfigLoad, padTo)
    this.printConfigStatus('Studio config', project.studioConfigPath, studioLoad, padTo)
    this.log('')
  }

  private async printStudioSection(
    projectDirectory: string,
    studioLoad: ConfigLoadResult<StudioWorkspace[]>,
    verbose: boolean,
  ): Promise<void> {
    this.log(sectionHeader('Studio'))

    if (studioLoad.error) {
      this.log(`  ${styleText('red', 'Failed to load studio configuration:')}`)
      if (verbose) {
        this.log(`  ${studioLoad.error.stack ?? studioLoad.error.message}\n`)
      } else {
        this.log(`  ${truncate(studioLoad.error.message)}\n`)
      }
      return
    }

    if (!studioLoad.value) return

    this.log('  Workspaces:')
    for (const ws of studioLoad.value) {
      const label = ws.name ?? 'default'
      this.log(`    ${label}`)
      this.log(formatKeyValue('Project ID', ws.projectId, {indent: 6, padTo: 10}))
      this.log(formatKeyValue('Dataset', ws.dataset, {indent: 6, padTo: 10}))
    }

    // Full resolution: try to resolve plugins and get roles
    try {
      const cliConfig = await this.getCliConfig()
      const projectId = cliConfig?.api?.projectId
      const user = await gatherUserInfo(projectId)
      const userId = user instanceof Error ? undefined : user.id

      const resolved = await gatherResolvedWorkspaces(projectDirectory, userId)

      this.log('')
      this.log('  Resolved configuration:')
      for (const ws of resolved) {
        this.log(`    ${ws.name} (${ws.title})`)
        if (ws.roles.length > 0) {
          this.log(formatKeyValue('Roles', ws.roles, {indent: 6, padTo: 5}))
        }
      }
    } catch (err) {
      this.log('')
      if (verbose && err instanceof Error && err.stack) {
        this.log(`  ${styleText('dim', 'Unable to resolve full studio configuration:')}`)
        this.log(`  ${styleText('dim', err.stack)}`)
      } else {
        const reason = truncate(err instanceof Error ? err.message : String(err))
        this.log(
          `  ${styleText('dim', `(unable to resolve full studio configuration: ${reason})`)}`,
        )
      }
    }
    this.log('')
  }

  private async printUserSection(projectId: string | undefined): Promise<void> {
    this.log(`\n${sectionHeader('User')}`)

    const user = await gatherUserInfo(projectId)
    if (user instanceof Error) {
      this.log(`  ${user.message}\n`)
      return
    }

    const padTo = 8 // "Provider" is the longest key
    this.log(formatKeyValue('Name', user.name, {padTo}))
    this.log(formatKeyValue('Email', user.email, {padTo}))
    this.log(formatKeyValue('ID', user.id, {padTo}))
    this.log(formatKeyValue('Provider', user.provider, {padTo}))
    this.log('')
  }
}

const MAX_ERROR_LENGTH = 200

function truncate(str: string): string {
  const collapsed = str.replaceAll(/\s*\n\s*/g, ' ').trim()
  if (collapsed.length <= MAX_ERROR_LENGTH) return collapsed
  return `${collapsed.slice(0, MAX_ERROR_LENGTH)}...`
}
