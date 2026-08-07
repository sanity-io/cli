import {Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'

import {type Robot} from '../../actions/tokens/types.js'
import {promptForProject} from '../../prompts/promptForProject.js'
import {getProjectMembership, getTokens} from '../../services/tokens.js'
import {Table} from '../../util/responsiveTable.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const listTokenDebug = subdebug('tokens:list')

export class TokensListCommand extends SanityCommand<typeof TokensListCommand> {
  static override description = 'List API tokens for the project'
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List tokens for the project',
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

  static override hiddenAliases: string[] = ['token:list']

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

    let tokens: Robot[]
    try {
      tokens = await getTokens(projectId)
    } catch (error) {
      const message = getErrorMessage(error)
      listTokenDebug(`Error fetching tokens for project ${projectId}`, error)
      this.error(`Token list retrieval failed:\n${message}`, {exit: exitCodes.RUNTIME_ERROR})
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
        {alignment: 'left', name: 'label', title: 'Label'},
        {alignment: 'left', name: 'id', title: 'ID'},
        {alignment: 'left', name: 'roles', title: 'Roles'},
        {alignment: 'left', name: 'expires', title: 'Expires'},
      ],
      title: `Found ${tokens.length} API tokens`,
    })

    for (const token of tokens) {
      const roles = getProjectMembership(token, projectId)?.roleNames.join(', ') || 'No roles'

      table.addRow({
        expires: token.expiresAt ? token.expiresAt.slice(0, 10) : 'Never',
        id: token.id,
        label: token.label,
        roles,
      })
    }

    this.log(table.render())
  }
}
