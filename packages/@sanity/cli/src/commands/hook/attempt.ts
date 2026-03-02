import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'

import {formatFailure} from '../../actions/hook/formatFailure.js'
import {type DeliveryAttempt} from '../../actions/hook/types.js'
import {getHookAttempt} from '../../services/hooks.js'

const attemptDebug = subdebug('hook:attempt')

export class AttemptHookCommand extends SanityCommand<typeof AttemptHookCommand> {
  static override args = {
    attemptId: Args.string({
      description: 'The delivery attempt ID to get details for',
      required: true,
    }),
  }
  static override description = 'Print details of a given webhook delivery attempt'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> abc123',
      description: 'Print details of webhook delivery attempt with ID abc123',
    },
  ]

  public async run() {
    const {args} = await this.parse(AttemptHookCommand)
    const {attemptId} = args

    const projectId = await this.getProjectId()

    let attempt: DeliveryAttempt
    try {
      attempt = await getHookAttempt({attemptId, projectId})
    } catch (error) {
      const err = error as Error
      attemptDebug(`Error fetching hook attempt ${attemptId}`, err)
      this.error(`Hook attempt retrieval failed:\n${err.message}`, {exit: 1})
    }

    const {createdAt, failureReason, inProgress, resultBody, resultCode} = attempt

    this.log(`Date: ${createdAt}`)
    this.log(`Status: ${this.getStatus(attempt)}`)
    this.log(`Status code: ${resultCode}`)

    if (attempt.isFailure) {
      this.log(`Failure: ${formatFailure(attempt)}`)
    }

    if (!inProgress && (!failureReason || failureReason === 'http')) {
      const body = resultBody ? `\n---\n${resultBody}\n---\n` : '<empty>'
      this.log(`Response body: ${body}`)
    }
  }

  private getStatus(attempt: DeliveryAttempt): string {
    if (attempt.isFailure) {
      return 'Failed'
    }

    if (attempt.inProgress) {
      return 'In progress'
    }

    return 'Delivered'
  }
}
