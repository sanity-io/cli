import {inspect, styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'
import groupBy from 'lodash-es/groupBy.js'

import {formatFailure} from '../../actions/hook/formatFailure.js'
import {type DeliveryAttempt, type Hook, type HookMessage} from '../../actions/hook/types'
import {promptForProject} from '../../prompts/promptForProject.js'
import {
  getHookAttemptsForProject,
  getHookMessagesForProject,
  getHooksForProject,
} from '../../services/hooks.js'
import {getProjectIdFlag} from '../../util/sharedFlags.js'

const logsHookDebug = subdebug('hook:logs')

export class LogsHookCommand extends SanityCommand<typeof LogsHookCommand> {
  static override args = {
    name: Args.string({
      description: 'Name of the hook to show logs for',
      required: false,
    }),
  }

  static override description = 'List latest log entries for a given hook'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List latest log entries for a given hook',
    },
    {
      command: '<%= config.bin %> <%= command.id %> [NAME]',
      description: 'List latest log entries for a specific hook by name',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project-id abc123',
      description: 'List hook logs for a specific project',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID to view webhook logs for',
      semantics: 'override',
    }),
    detailed: Flags.boolean({
      description: 'Include detailed payload and attempts',
      required: false,
    }),
  }

  public async run() {
    const {args, flags} = await this.parse(LogsHookCommand)

    // Ensure we have project context
    const projectId = await this.getProjectId({
      fallback: () =>
        promptForProject({
          requiredPermissions: [{grant: 'read', permission: 'sanity.project.webhooks'}],
        }),
    })

    // Get hooks for the project
    let hooks: Hook[]
    try {
      hooks = await getHooksForProject(projectId)
    } catch (error) {
      const err = error as Error
      logsHookDebug(`Error fetching hooks for project ${projectId}`, err)
      this.error(`Hook list retrieval failed:\n${err.message}`, {exit: 1})
    }

    if (hooks.length === 0) {
      this.error('No hooks currently registered', {exit: 1})
    }

    // If hook name is provided, find that specific hook
    let selectedHook: Hook | undefined
    if (args.name) {
      selectedHook = hooks.find((hook) => hook.name.toLowerCase() === args.name?.toLowerCase())
      if (!selectedHook) {
        this.error(`Hook with name "${args.name}" not found`, {exit: 1})
      }
    } else if (hooks.length === 1) {
      // If only one hook exists, use that
      selectedHook = hooks[0]
    } else {
      // Otherwise prompt user to select a hook
      selectedHook = await this.selectHook(hooks)
    }

    if (!selectedHook) {
      this.error('No hook selected', {exit: 1})
    }

    // Fetch messages and attempts for the selected hook
    let messages: HookMessage[]
    let attempts: DeliveryAttempt[] = []
    try {
      ;[messages, attempts] = await Promise.all([
        getHookMessagesForProject({
          hookId: selectedHook.id,
          projectId,
        }),
        getHookAttemptsForProject({
          hookId: selectedHook.id,
          projectId,
        }),
      ])
    } catch (error) {
      const err = error as Error
      logsHookDebug(`Error fetching logs for hook ${selectedHook.id}`, err)
      this.error(`Hook logs retrieval failed:\n${err.message}`, {exit: 1})
    }

    // Group attempts by message ID
    const groupedAttempts = groupBy(attempts, 'messageId')

    // Populate messages with attempts
    const populated = messages.map((msg): HookMessage & {attempts: DeliveryAttempt[]} => ({
      ...msg,
      attempts: groupedAttempts[msg.id] || [],
    }))

    const totalMessages = messages.length - 1

    for (const [i, message] of populated.entries()) {
      this.printMessage(message, {detailed: flags.detailed})
      this.printSeparator(totalMessages === i)
    }
  }

  private formatAttemptDate(dateString: string): string {
    try {
      return new Date(dateString).toISOString().replace(/\.\d+Z$/, 'Z')
    } catch {
      return dateString // fallback to original if parsing fails
    }
  }

  private printMessage(
    message: HookMessage & {attempts: DeliveryAttempt[]},
    options: {detailed?: boolean},
  ) {
    const {detailed} = options

    this.log(`Date: ${message.createdAt}`)
    this.log(`Status: ${message.status}`)
    if (message.resultCode) {
      this.log(`Result code: ${message.resultCode}`)
    }

    if (message.failureCount > 0) {
      this.log(`Failures: ${message.failureCount}`)
    }

    if (detailed) {
      this.log('Payload:')
      try {
        const payload = JSON.parse(message.payload)
        this.log(inspect(payload, {colors: true}))
      } catch (error) {
        this.log(`Payload (raw): ${message.payload}`)
        logsHookDebug('Failed to parse payload JSON:', error)
      }
    }

    if (detailed && message.attempts && message.attempts.length > 0) {
      this.log('Attempts:')
      for (const attempt of message.attempts) {
        const date = this.formatAttemptDate(attempt.createdAt)
        const prefix = `  [${date}]`

        if (attempt.inProgress) {
          this.log(`${prefix} ${styleText('yellow', 'Pending')}`)
        } else if (attempt.isFailure) {
          const failure = formatFailure(attempt, {includeHelp: true})
          this.log(`${prefix} ${styleText('yellow', `Failure: ${failure}`)}`)
        } else {
          this.log(`${prefix} Success: HTTP ${attempt.resultCode} (${attempt.duration}ms)`)
        }
      }
    }

    // Leave some empty space between messages
    this.log('')
  }

  private printSeparator(skip: boolean) {
    if (!skip) {
      this.log('---\n')
    }
  }

  private async selectHook(hooks: Hook[]) {
    const hookId = await select({
      choices: hooks.map((hook) => ({
        name: hook.name,
        value: hook.id,
      })),
      message: 'Select hook to list logs for',
    })

    return hooks.find((hook) => hook.id === hookId)
  }
}
