import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm, select} from '@sanity/cli-core/ux'
import {ClientError} from '@sanity/client'

import {promptForProject} from '../../prompts/promptForProject.js'
import {deleteToken, getTokens} from '../../services/tokens.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const deleteTokenDebug = subdebug('tokens:delete')

export class DeleteTokensCommand extends SanityCommand<typeof DeleteTokensCommand> {
  static override args = {
    tokenId: Args.string({
      description: 'Token ID to delete (will prompt if not provided)',
      required: false,
    }),
  }

  static override description = 'Delete an API token from the project'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively select and delete a token',
    },
    {
      command: '<%= config.bin %> <%= command.id %> silJ2lFmK6dONB',
      description: 'Delete a specific token by ID',
    },
    {
      command: '<%= config.bin %> <%= command.id %> silJ2lFmK6dONB --yes',
      description: 'Delete a specific token without confirmation prompt',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'Delete a token from a specific project',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to delete token from',
      semantics: 'override',
    }),
    yes: Flags.boolean({
      aliases: ['y'],
      description: 'Skip confirmation prompt (unattended mode)',
      required: false,
    }),
  }

  static override hiddenAliases: string[] = ['token:delete']

  private projectId!: string

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DeleteTokensCommand)

    const skipConfirmation = flags.yes
    const unattended = this.isUnattended()
    const {tokenId: givenTokenId} = args

    if (unattended && !givenTokenId) {
      this.error('Token ID is required. Pass it as the `<tokenId>` argument.', {exit: 2})
    }

    if (unattended && !skipConfirmation) {
      this.error('Deletion requires confirmation. Pass `--yes` to delete the token.', {exit: 2})
    }

    // Ensure we have project context
    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'delete', permission: 'sanity.project.tokens'}],
        }),
    })

    this.projectId = projectId

    const tokenId = givenTokenId || (await this.getTokenIdFromList())

    if (!skipConfirmation) {
      const confirmed = await confirm({
        default: false,
        message: `Delete API token "${tokenId}"?`,
      })

      if (!confirmed) {
        this.log('API token not deleted')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    try {
      await deleteToken({
        projectId: this.projectId,
        tokenId,
      })

      this.log('API token deleted')
    } catch (error) {
      if (error instanceof ClientError && error.response.statusCode === 404) {
        this.error(`Token with ID "${tokenId}" not found`, {exit: 1})
      }

      const err = error as Error
      deleteTokenDebug(`Error deleting token`, err)
      this.error(`Token deletion failed:\n${err.message}`, {exit: 1})
    }
  }

  private async getTokenIdFromList() {
    let tokens: Awaited<ReturnType<typeof getTokens>>
    try {
      tokens = await getTokens(this.projectId)
    } catch (error) {
      const err = error as Error
      deleteTokenDebug(`Error fetching tokens for project ${this.projectId}`, err)
      this.error(
        `Could not list API tokens:\n${err.message}\nCheck the project ID and your access permissions, then try again.`,
        {exit: 1},
      )
    }

    if (tokens.length === 0) {
      this.error('No API tokens found for this project.', {exit: 1})
    }

    const choices = tokens.map((token) => ({
      name: `${token.label} (${(token.roles || []).map((r) => r.title).join(', ')})`,
      value: token.id,
    }))

    return select({
      choices,
      message: 'Select token to delete:',
    })
  }
}
