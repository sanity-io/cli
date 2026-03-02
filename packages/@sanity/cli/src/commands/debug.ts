import path from 'node:path'
import {styleText} from 'node:util'

import {Flags} from '@oclif/core'
import {formatObject, printKeyValue, SanityCommand} from '@sanity/cli-core'
import omit from 'lodash-es/omit.js'
import padStart from 'lodash-es/padStart.js'

import {gatherDebugInfo} from '../actions/debug/gatherDebugInfo.js'
import {getGlobalConfigLocation} from '../actions/debug/getGlobalConfigLocation.js'
import {getDisplayName, getFormatters} from '../actions/versions/getFormatters.js'

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
  }

  public async run(): Promise<void> {
    const {flags} = this

    try {
      const projectRoot = await this.getProjectRoot()
      const cliConfig = await this.getCliConfig()

      const {auth, globalConfig, project, projectConfig, user, versions} = await gatherDebugInfo({
        cliConfig,
        includeSecrets: flags.secrets,
        projectRoot,
      })

      this.output.log('\nUser:')
      if (user instanceof Error) {
        this.log(`  ${styleText('red', user.message)}\n`)
      } else if (user) {
        printKeyValue({
          ID: user.id,
          Name: user.name,
          // eslint-disable-next-line perfectionist/sort-objects
          Email: user.email,
          Roles: project && 'userRoles' in project ? project.userRoles : undefined,
        })
      }

      // Project info (API-based)
      if (project && 'id' in project) {
        this.log('Project:')
        printKeyValue({
          ID: project.id,
          // eslint-disable-next-line perfectionist/sort-objects
          'Display name': project.displayName,
        })
      }

      // Auth info
      if (auth.hasToken) {
        this.log('Authentication:')
        printKeyValue({
          'Auth token': flags.secrets ? auth.authToken : `<redacted>`,
          'User type': globalConfig.authType || 'normal',
        })

        if (!flags.secrets) {
          this.log('  (run with --secrets to reveal token)\n')
        }
      }

      // Global configuration (user home dir config file)
      this.log(`Global config (${styleText('yellow', getGlobalConfigLocation())}):`)
      const globalCfg = omit(globalConfig, ['authType', 'authToken'])
      this.log(`  ${formatObject(globalCfg).replaceAll('\n', '\n  ')}\n`)

      // Project configuration (projectDir/sanity.json)
      if (projectConfig) {
        const configLocation = projectConfig
          ? ` (${styleText('yellow', path.relative(process.cwd(), projectRoot.path))})`
          : ''

        this.log(`Project config${configLocation}:`)
        this.log(`  ${formatObject(projectConfig).replaceAll('\n', '\n  ')}`)
      }

      // Print installed package versions
      if (versions) {
        this.log('\nPackage versions:')

        const {formatName, versionLength} = getFormatters(versions)
        for (const mod of versions) {
          const version = padStart(mod.installed || '<missing>', versionLength)
          const latest =
            mod.installed === mod.latest
              ? styleText('green', '(up to date)')
              : `(latest: ${styleText('yellow', mod.latest)})`

          this.log(`${formatName(getDisplayName(mod))} ${version} ${latest}`)
        }

        this.log('')
      }
    } catch (error) {
      this.error(
        `Failed to gather debug information: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }
}
