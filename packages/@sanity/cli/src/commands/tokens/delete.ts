import {confirm, select} from '@inquirer/prompts'
import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {ClientError, type SanityClient} from '@sanity/client'

import {TOKENS_API_VERSION} from '../../actions/tokens/constants.js'
import {deleteTokenFromProject} from '../../services/deleteTokenFromProject.js'
import {getProjectTokens} from '../../services/getProjectTokens.js'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const deleteTokenDebug = subdebug('tokens:delete')

export class DeleteTokenCommand extends SanityCommand<typeof DeleteTokenCommand> {
  static override args = {
    tokenId: Args.string({
      description: 'Token ID to delete (will prompt if not provided)',
      required: false,
    }),
  }

  static override description = 'Delete an API token from this project'

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
  ]

  static override flags = {
    yes: Flags.boolean({
      aliases: ['y'],
      description: 'Skip confirmation prompt (unattended mode)',
      required: false,
    }),
  }

  private client!: SanityClient
  private projectId!: string

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DeleteTokenCommand)

    const unattended = flags.yes
    const {tokenId: givenTokenId} = args

    if (unattended && !givenTokenId) {
      this.error(
        'Token ID is required in non-interactive mode. Provide a token ID as an argument.',
        {exit: 1},
      )
    }

    this.client = await this.getGlobalApiClient({
      apiVersion: TOKENS_API_VERSION,
      requireUser: true,
    })

    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    this.projectId = projectId

    let tokenId: string | undefined

    try {
      tokenId = givenTokenId || (await this.getTokenIdFromList())

      if (!unattended) {
        const confirmed = await confirm({
          default: false,
          message: `Are you sure you want to delete the token with ID "${tokenId}"?`,
        })

        if (!confirmed) {
          this.error('Operation cancelled', {exit: 1})
        }
      }

      await deleteTokenFromProject({
        client: this.client,
        projectId: this.projectId,
        tokenId,
      })

      this.log('Token deleted successfully')
    } catch (error) {
      if (error instanceof ClientError && error.response.statusCode === 404) {
        this.error(`Token with ID "${tokenId}" not found`, {exit: 1})
        return
      }

      const err = error as Error
      deleteTokenDebug(`Error deleting token`, err)
      this.error(`Token deletion failed:\n${err.message}`, {exit: 1})
    }
  }

  private async getTokenIdFromList() {
    const tokens = await getProjectTokens({client: this.client, projectId: this.projectId})

    if (tokens.length === 0) {
      throw new Error('No tokens found')
    }

    const choices = tokens.map((token) => ({
      name: `${token.label} (${(token.roles || []).map((r: {title: string}) => r.title).join(', ')})`,
      value: token.id,
    }))

    return select({
      choices,
      message: 'Select token to delete:',
    })
  }
}
