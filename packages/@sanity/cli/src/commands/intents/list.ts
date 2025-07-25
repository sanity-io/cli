import {Flags} from '@oclif/core'
import chalk from 'chalk'
import {size} from 'lodash-es'

import {getDashboardStoreId} from '../../actions/intents/getDashboardStoreId.js'
import {queryDashboardStore} from '../../actions/intents/queryDashboardStore.js'
import {type Intent} from '../../actions/intents/types.js'
import {SanityCliCommand} from '../../BaseCommand.js'
import {subdebug} from '../../debug.js'

// unfortunately, querying the dashboard store is still experimental
const LIST_INTENTS_API_VERSION = 'vX'
const intentsDebug = subdebug('intents')

export class List extends SanityCliCommand<typeof List> {
  static override description = 'List available intents for an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List intents for organization (if organization specified in sanity.cli.ts)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --organization abc123',
      description: 'List intents for specified organization',
    },
  ]

  static override flags = {
    organization: Flags.string({
      description: 'Organization ID to use',
    }),
  }

  public async run(): Promise<void> {
    const {organization} = this.flags

    const client = await this.getGlobalApiClient({
      apiVersion: LIST_INTENTS_API_VERSION,
      requireUser: true,
    })

    const cliConfig = await this.getCliConfig()
    const configOrganizationId = cliConfig?.app?.organizationId

    const organizationId = organization ?? configOrganizationId

    if (!organizationId) {
      this.error(
        'Organization ID is required. Provide it via an --organization flag or set it in your sanity.cli.ts config file under the app.organizationId property.',
        {exit: 1},
      )
    }

    try {
      const dashboardStoreId = await getDashboardStoreId({
        client,
        organizationId,
      })

      const intents = await queryDashboardStore<Intent>({
        client,
        dashboardStoreId,
        query: `*[_type == "sanity.dashboard.intents"]`,
      })

      if (!intents || !Array.isArray(intents) || intents.length === 0) {
        this.log(`No intents found for organization ${organizationId}.`)
        return
      }

      const tableHeaders = ['ID', 'Application', 'Title', 'Created By', 'Updated At']

      const rows = intents.map((intent: Intent) => [
        intent.id,
        intent.applicationId,
        intent.title,
        intent._system.createdBy,
        new Date(intent._updatedAt).toLocaleString(),
      ])

      // Initialize maxWidths with the width of each header
      const maxWidths = tableHeaders.map((str) => size(str))

      // Calculate maximum width for each column
      for (const row of rows) {
        for (const [i, element] of row.entries()) {
          maxWidths[i] = Math.max(size(element), maxWidths[i])
        }
      }
      const printRow = (row: string[]) =>
        row.map((col, i) => `${col}`.padEnd(maxWidths[i])).join('   ')

      this.log(chalk.cyan(printRow(tableHeaders)))
      for (const row of rows) this.log(printRow(row))
    } catch (error) {
      intentsDebug('Error listing intents', error)
      this.error('Failed to list intents', {exit: 1})
    }
  }
}
