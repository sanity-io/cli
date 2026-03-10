import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {Table} from 'console-table-printer'

import {type Token} from '../../actions/tokens/types.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {getTokens} from '../../services/tokens.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const listTokenDebug = subdebug('tokens:list')

export class TokensListCommand extends SanityCommand<typeof TokensListCommand> {
  static override description = 'List API tokens for the current project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List tokens for the current project',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'List tokens in JSON format',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'List tokens for a specific project',
    },
  ]
  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to list tokens for',
      semantics: 'override',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output tokens in JSON format',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(TokensListCommand)
    const {json} = flags
    const outputJson = json ?? false

    // Ensure we have project context
    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'read', permission: 'sanity.project.tokens'}],
        }),
    })

    let tokens: Token[]
    try {
      tokens = await getTokens(projectId)
    } catch (error) {
      const message = getErrorMessage(error)
      listTokenDebug(`Error fetching tokens for project ${projectId}`, error)
      this.error(`Token list retrieval failed:\n${message}`, {exit: 1})
    }

    if (outputJson) {
      this.log(JSON.stringify(tokens, null, 2))
      return
    }

    if (tokens.length === 0) {
      this.log('No API tokens found for this project.')
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', maxLen: 40, name: 'label', title: 'Label'},
        {alignment: 'left', maxLen: 20, name: 'id', title: 'Token ID'},
        {alignment: 'left', maxLen: 30, name: 'roles', title: 'Roles'},
      ],
      title: `Found ${tokens.length} API tokens`,
    })

    for (const token of tokens) {
      const roles = token.roles?.map((role) => role.title).join(', ') || 'No roles'
      const truncatedLabel =
        token.label.length > 37 ? `${token.label.slice(0, 37)}...` : token.label
      const truncatedRoles = roles.length > 27 ? `${roles.slice(0, 27)}...` : roles

      table.addRow({
        id: token.id,
        label: truncatedLabel,
        roles: truncatedRoles,
      })
    }

    table.printTable()
  }
}
