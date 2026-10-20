import {Args, Flags} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {requiredWhenUnattended} from '@sanity/cli-core/flags'
import {confirm, select} from '@sanity/cli-core/ux'
import {ClientError} from '@sanity/client'

import {formatTokenAccess} from '../../actions/tokens/formatTokenAccess.js'
import {type TokenScope} from '../../actions/tokens/types.js'
import {deleteToken, getTokens} from '../../services/tokens.js'
import {formatCliErrorMessages} from '../../util/formatCliErrorMessages.js'
import {resolveTokenScope} from '../../util/resolveTokenScope.js'
import {getOrganizationFlag, getProjectIdFlag} from '../../util/sharedFlags.js'

const deleteTokenDebug = subdebug('tokens:delete')

export class DeleteTokensCommand extends SanityCommand<typeof DeleteTokensCommand> {
  static override args = {
    tokenId: Args.string({
      description: 'Token ID to delete (will prompt if not provided)',
      required: false,
    }),
  }

  static override description = 'Delete an API token from a project or organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --organization org123',
      description: 'Interactively select and delete an organization token',
    },
    {
      command: '<%= config.bin %> <%= command.id %> silJ2lFmK6dONB --organization org123 --yes',
      description: 'Delete an organization token without confirmation',
    },
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
    ...getOrganizationFlag({
      description: 'Delete a token managed by this organization',
      exclusive: ['project-id'],
      semantics: 'specify',
    }),
    ...getProjectIdFlag({
      description: 'Project ID to delete token from',
      semantics: 'override',
    }),
    yes: requiredWhenUnattended(
      Flags.boolean({
        char: 'y',
        description: 'Skip confirmation prompt (unattended mode)',
      }),
    ),
  }

  static override hiddenAliases: string[] = ['token:delete']

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(DeleteTokensCommand)

    const skipConfirmation = flags.yes
    const unattended = this.isUnattended()
    const {tokenId: givenTokenId} = args

    if (unattended) {
      const errors: string[] = []

      if (!givenTokenId) {
        errors.push('Token ID is required. Pass it as the `<tokenId>` argument.')
      }
      if (errors.length > 0) {
        this.error(formatCliErrorMessages(errors), {
          exit: exitCodes.USAGE_ERROR,
        })
      }
    }

    const scope = await resolveTokenScope({
      getProjectId: this.getProjectId.bind(this),
      grant: 'delete',
      organization: flags.organization,
    })

    const tokenId = givenTokenId || (await this.getTokenIdFromList(scope))

    if (!skipConfirmation) {
      const confirmed = await confirm({
        default: false,
        message:
          scope.resourceType === 'organization'
            ? `Delete API token "${tokenId}" from organization "${scope.resourceId}"? This revokes all of its organization and project access.`
            : `Delete API token "${tokenId}"?`,
      })

      if (!confirmed) {
        this.log('API token not deleted')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    try {
      await deleteToken(scope, tokenId)

      this.log('API token deleted')
    } catch (error) {
      if (error instanceof ClientError && error.response.statusCode === 404) {
        this.error(`Token with ID "${tokenId}" not found`, {exit: exitCodes.RUNTIME_ERROR})
      }

      const err = error as Error
      deleteTokenDebug(`Error deleting token`, err)
      this.error(`Token deletion failed:\n${err.message}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }

  private async getTokenIdFromList(scope: TokenScope) {
    let tokens: Awaited<ReturnType<typeof getTokens>>
    try {
      tokens = await getTokens(scope)
    } catch (error) {
      const err = error as Error
      deleteTokenDebug(`Error fetching tokens for ${scope.resourceType} ${scope.resourceId}`, err)
      this.error(
        `Could not list API tokens:\n${err.message}\nCheck the ${scope.resourceType} ID and your access permissions, then try again.`,
        {exit: exitCodes.RUNTIME_ERROR},
      )
    }

    if (tokens.length === 0) {
      this.error(`No API tokens found for this ${scope.resourceType}.`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }

    const choices = tokens.map((token) => {
      const access = formatTokenAccess(token, scope)
      return {name: `${token.label} [${token.id}] (${access})`, value: token.id}
    })

    return select({
      choices,
      message: 'Select token to delete:',
    })
  }
}
