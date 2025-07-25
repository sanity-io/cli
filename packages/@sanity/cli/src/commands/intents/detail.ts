import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'

import {getDashboardStoreId} from '../../actions/intents/getDashboardStoreId.js'
import {queryDashboardStore} from '../../actions/intents/queryDashboardStore.js'
import {type Intent} from '../../actions/intents/types.js'
import {SanityCliCommand} from '../../BaseCommand.js'
import {subdebug} from '../../debug.js'

// querying the dashboard store is still experimental
const DETAIL_INTENTS_API_VERSION = 'vX'
const intentsDebug = subdebug('intents')

export class Detail extends SanityCliCommand<typeof Detail> {
  static override args = {
    intentId: Args.string({
      description: 'The ID of the intent to show details for',
      required: true,
    }),
  }

  static override description = 'Show detailed information about a specific intent'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> myIntentId',
      description: 'Show details for a specific intent (using organization ID in sanity.cli.ts)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> myIntentId --organization abc123',
      description: 'Show details for specific intent with organization ID',
    },
  ]

  static override flags = {
    organization: Flags.string({
      description: 'Organization ID to use',
    }),
  }

  public async run(): Promise<void> {
    const {intentId} = this.args
    const {organization} = this.flags

    const client = await this.getGlobalApiClient({
      apiVersion: DETAIL_INTENTS_API_VERSION,
      requireUser: true,
    })

    const cliConfig = await this.getCliConfig()
    const configOrganizationId = cliConfig?.app?.organizationId

    const organizationId = organization ?? configOrganizationId

    if (!organizationId) {
      this.error(
        'Organization ID is required. Provide it via an --organization flag or set it in your sanity.cli.ts config file under the app.organizationId property.',
      )
    }

    try {
      const dashboardStoreId = await getDashboardStoreId({
        client,
        organizationId,
      })

      const intent = await queryDashboardStore<Intent>({
        client,
        dashboardStoreId,
        query: `*[_type == "sanity.dashboard.intents" && id == "${intentId}"][0]`,
      })

      if (!intent) {
        this.log(`No intent found with ID: "${intentId}" for organization ${organizationId}.`)
        return
      }

      this.log(chalk.cyan.bold('Intent Details'))
      this.log('')
      this.log(`${chalk.bold('ID:')} ${intent.id}`)
      this.log(`${chalk.bold('Title:')} ${intent.title}`)
      this.log(`${chalk.bold('Application:')} ${intent.applicationId}`)
      this.log(`${chalk.bold('Action:')} ${intent.action}`)

      if (intent.description) {
        this.log(`${chalk.bold('Description:')} ${intent.description}`)
      }

      this.log(`${chalk.bold('Created By:')} ${intent._system.createdBy}`)
      this.log(`${chalk.bold('Updated At:')} ${new Date(intent._updatedAt).toLocaleString()}`)

      this.log('')
      this.log(chalk.cyan.bold('Filters'))

      if (intent.filters && intent.filters.length > 0) {
        for (const [index, filter] of intent.filters.entries()) {
          this.log(`${chalk.bold(`Filter ${index + 1}:`)}`)
          if (filter.projectId) {
            this.log(`  ${chalk.bold('Project ID:')} ${filter.projectId}`)
          }
          if (filter.dataset) {
            this.log(`  ${chalk.bold('Dataset:')} ${filter.dataset}`)
          }
          if (filter.types && filter.types.length > 0) {
            this.log(`  ${chalk.bold('Types:')} ${filter.types.join(', ')}`)
          }
          if (index < intent.filters.length - 1) {
            this.log('')
          }
        }
      } else {
        this.log('No filters defined')
      }
    } catch (error) {
      intentsDebug('Error getting intent details', error)
      this.error(`Failed to get intent details for ID "${intentId}".`, {exit: 1})
    }
  }
}
