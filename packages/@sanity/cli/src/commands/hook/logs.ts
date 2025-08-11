import {select} from '@inquirer/prompts'
import {Args} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import {groupBy} from 'lodash-es'

import {HOOK_API_VERSION} from '../../actions/hook/constants.js'
import {type DeliveryAttempt, type Hook, type HookMessage} from '../../actions/hook/types'
import {NO_PROJECT_ID} from '../../util/errorMessages.js'

const logsHookDebug = subdebug('hook:logs')

export class Logs extends SanityCommand<typeof Logs> {
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
  ]

  public async run() {
    const {args} = await this.parse(Logs)
    const client = await this.getGlobalApiClient({
      apiVersion: HOOK_API_VERSION,
      requireUser: true,
    })

    // Ensure we have project context
    const projectId = await this.getProjectId()
    if (!projectId) {
      this.error(NO_PROJECT_ID, {exit: 1})
    }

    // Get hooks for the project
    let hooks: Hook[]
    try {
      hooks = await client.request<Hook[]>({uri: `/hooks/projects/${projectId}`})
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
      const hookId = await select({
        choices: hooks.map((hook) => ({
          name: hook.name,
          value: hook.id,
        })),
        message: 'Select hook to list logs for',
      })

      selectedHook = hooks.find((hook) => hook.id === hookId)
    }

    if (!selectedHook) {
      this.error('No hook selected', {exit: 1})
    }

    // Fetch messages and attempts for the selected hook
    let messages: HookMessage[]
    let attempts: DeliveryAttempt[]
    try {
      messages = await client.request<HookMessage[]>({uri: `/hooks/${selectedHook.id}/messages`})
      attempts = await client.request<DeliveryAttempt[]>({
        uri: `/hooks/${selectedHook.id}/attempts`,
      })
    } catch (error) {
      const err = error as Error
      logsHookDebug(`Error fetching logs for hook ${selectedHook.id}`, err)
      this.error(`Hook logs retrieval failed:\n${err.message}`, {exit: 1})
    }

    // Group attempts by message ID
    const groupedAttempts = groupBy(attempts, 'messageId')

    // Print logs
    for (const message of messages) {
      const messageAttempts = groupedAttempts[message.id] || []
      this.printMessage(message, messageAttempts)
      this.log('---\n')
    }
  }

  private printMessage(message: HookMessage, attempts: DeliveryAttempt[]) {
    const latestAttempt = attempts.at(-1)

    this.log(`Date: ${message.createdAt}`)

    if (latestAttempt) {
      this.log(`Status: ${latestAttempt.status}`)
      if (latestAttempt.statusCode) {
        this.log(`Result code: ${latestAttempt.statusCode}`)
      }
      if (latestAttempt.error) {
        this.log(`Error: ${latestAttempt.error}`)
      }
      this.log(`Failures: ${attempts.length}`)
    }
  }
}
