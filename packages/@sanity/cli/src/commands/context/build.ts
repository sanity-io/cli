import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'

import {contextCommand} from '../../actions/context/contextCommand.js'
import {type OperationRequest} from '../../actions/context/operationInput.js'
import {requestContext} from '../../services/context.js'

const BaseCommand = contextCommand('context build')

/**
 * `context build` keeps `--cancel`, which calls the cancel operation instead
 * of starting a build
 */
export class BuildKnowledgeBaseCommand extends BaseCommand {
  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'Start a build and return the job ID',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --watch',
      description: 'Start a build and wait for it to finish (non-zero exit on failure)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 --cancel',
      description: 'Cancel the running build, if any',
    },
  ]

  static override flags = {
    ...BaseCommand.flags,
    cancel: Flags.boolean({
      default: false,
      description: 'Cancel the running build instead of starting one',
      exclusive: ['watch'],
    }),
  } satisfies FlagInput

  public override render(result: unknown): void {
    if (!this.flags.cancel || this.flags.json) {
      super.render(result)
      return
    }
    const cancelled = typeof result === 'object' && result !== null && 'cancelled' in result
    this.log(cancelled && result.cancelled ? 'Build cancelled' : 'No running build to cancel')
  }

  public override async send(
    request: OperationRequest,
    flags: Record<string, unknown>,
  ): Promise<unknown> {
    if (!flags.cancel) return super.send(request, flags)
    return requestContext('POST /knowledge-bases/{knowledgeBaseId}/build/cancel', {
      params: request.params,
    })
  }
}
