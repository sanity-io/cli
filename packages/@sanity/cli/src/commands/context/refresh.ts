import {Args} from '@oclif/core'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {formatKeyValue} from '../../actions/debug/output.js'
import {refreshKnowledgeBase} from '../../services/context.js'

const refreshContextDebug = subdebug('context:refresh')

export class RefreshKnowledgeBaseCommand extends SanityCommand<typeof RefreshKnowledgeBaseCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),
  }

  static override description = 'Refresh a knowledge base: re-check sources and apply what changed'

  static override enableJsonFlag = true

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123',
      description: 'Start an incremental refresh',
    },
  ]

  public async run(): Promise<{jobId: string; knowledgeBaseId: string; started: boolean}> {
    const {knowledgeBaseId} = this.args

    const spin = this.jsonEnabled() ? undefined : spinner('Starting refresh').start()
    let result: {jobId: string; started: boolean}
    try {
      result = await refreshKnowledgeBase(knowledgeBaseId)
    } catch (error) {
      spin?.fail()
      refreshContextDebug('Error refreshing knowledge base', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Knowledge base "${knowledgeBaseId}" not found`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      this.error(`Failed to refresh knowledge base: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
    spin?.succeed(result.started ? 'Refresh started' : 'Refresh already in progress')
    this.log(formatKeyValue('Job ID', result.jobId))
    this.log(`Check progress with: sanity context get ${knowledgeBaseId}`)
    return {...result, knowledgeBaseId}
  }
}
