import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes} from '@sanity/cli-core'
import {requiredWhenUnattended} from '@sanity/cli-core/flags'
import {select} from '@sanity/cli-core/ux'

import {contextCommand} from '../../../actions/context/contextCommand.js'
import {type OperationRequest} from '../../../actions/context/operationInput.js'
import {getIssue} from '../../../services/context.js'

const BaseCommand = contextCommand('context issues resolve')

/**
 * `context issues resolve` keeps `--side`, and without it, asks which side of
 * the conflict is correct, listing the sides from the issue document
 */
export class ResolveIssueCommand extends BaseCommand {
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue-def456',
      description: 'Choose the correct side interactively',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 issue-def456 --side 1 --watch',
      description: 'Choose side 1 and wait for the entry rewrite',
    },
  ]

  static override flags = {
    ...BaseCommand.flags,
    side: requiredWhenUnattended(
      Flags.integer({
        description: 'Index of the correct side, as listed by `sanity context issues get`',
        min: 0,
      }),
    ),
  } satisfies FlagInput

  public override async send(
    request: OperationRequest,
    values: Record<string, unknown>,
  ): Promise<unknown> {
    const side =
      typeof values.side === 'number'
        ? values.side
        : await this.promptForSide(request.params.knowledgeBaseId, request.params.issueId)
    return super.send({...request, body: {resolution: side}}, values)
  }

  private async promptForSide(knowledgeBaseId: string, issueId: string): Promise<number> {
    const issue = await getIssue(knowledgeBaseId, issueId)
    if (!issue) {
      this.error(`Issue "${issueId}" not found on knowledge base "${knowledgeBaseId}"`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    if (issue.status === 'rejected') {
      this.error(`Issue "${issueId}" is rejected (dismissed) and cannot be resolved`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    const {content} = issue
    if (content.kind !== 'conflict') {
      this.error(`Only conflict issues can be resolved, "${issueId}" is of kind ${content.kind}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    return select({
      choices: content.sides.map((side, index) => ({
        name: `[${index}] ${side.claim}`,
        value: index,
      })),
      // Re-resolving keeps the current choice preselected, so Enter can't flip it
      default: issue.resolution ?? content.suggested,
      message: 'Which side is correct?',
    })
  }
}
