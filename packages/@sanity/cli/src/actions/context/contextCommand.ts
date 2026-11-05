import {type Command} from '@oclif/core'
import {CLIError} from '@oclif/core/errors'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage, JsonOutputError} from '@sanity/cli-core/errors'
import {confirm} from '@sanity/cli-core/ux'
import {isHttpError} from '@sanity/client'

import {contextOperations} from '../../generated/contextOperations.js'
import {promptForText} from '../../prompts/promptForText.js'
import {
  describeBlueprintManager,
  getKnowledgeBaseBlueprintOwnership,
  getSource,
  requestAllPages,
  requestContext,
} from '../../services/context.js'
import {type CommandTelemetry} from '../../util/telemetry/commandTelemetry.js'
import {
  type ContextCommandEntry,
  type ContextCommandId,
  contextCommandTable,
} from './commandTable.js'
import {
  buildOperationRequest,
  flagName,
  humanize,
  needsOrganization,
  operationArgs,
  operationFlags,
  type OperationRequest,
  redactedFlags,
} from './operationInput.js'
import {type ContextOperation} from './operationTypes.js'
import {renderOperationResult} from './renderOperationResult.js'
import {resolveOrganizationId} from './resolveOrganizationId.js'
import {heldSyncHint} from './syncOutput.js'
import {type SyncTarget} from './waitForSourceSync.js'
import {formatJobFailure, watchJob} from './watchJob.js'
import {formatSyncFailure, watchSourceSync} from './watchSourceSync.js'

type Values = Record<string, unknown>

function stringValue(values: Values, name: string): string | undefined {
  const value = values[name]
  return typeof value === 'string' ? value : undefined
}

function record(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null || !(name in value)) return undefined
  return Object.entries(value).find(([key]) => key === name)?.[1]
}

function field(value: unknown, name: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(name in value)) return undefined
  const found: unknown = Object.entries(value).find(([key]) => key === name)?.[1]
  return typeof found === 'string' ? found : undefined
}

function examples(operation: ContextOperation): Command.Example[] {
  const args = operation.pathParams
    .filter((param) => param.name !== 'organizationId')
    .map((param) => `<${param.name}>`)
    .join(' ')
  const invocation = `<%= config.bin %> <%= command.id %>${args ? ` ${args}` : ''}`
  return [
    {command: invocation, description: operation.summary},
    {command: `${invocation} --json`, description: `${operation.summary}, as JSON`},
  ]
}

function getEntry(id: ContextCommandId): ContextCommandEntry {
  const entry = contextCommandTable.find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`No context command "${id}" in the command table`)
  return entry
}

/**
 * The command class for an entry of the command table, built from the
 * operation the spec describes: its arguments and flags, the request, and
 * output as JSON with `--json` or as a table or key-value lines otherwise.
 * Hand-written commands extend it and override `send` or `render`.
 */
export function contextCommand(id: ContextCommandId) {
  const entry = getEntry(id)
  const operations: Readonly<Record<string, ContextOperation>> = contextOperations
  const operation = operations[entry.operationId]
  if (!operation) throw new Error(`No operation "${entry.operationId}" in the generated operations`)
  const debug = subdebug(id.replaceAll(' ', ':'))
  const flags = operationFlags(operation, entry)

  return class ContextOperationCommand extends SanityCommand<typeof ContextOperationCommand> {
    static override args = operationArgs(operation, entry)
    static override description = operation.description || operation.summary
    static override enableJsonFlag = true
    static override examples = examples(operation)
    static override flags = flags
    static override summary = operation.summary
    static telemetry: CommandTelemetry = {
      // Generated flags have no aliases or chars, so each is redacted under its name alone
      redactedFlags: redactedFlags(operation, entry).map((name) => ({
        canonical: `--${name}`,
        flags: [`--${name}`],
      })),
    }

    readonly entry = entry
    readonly operation = operation

    public async confirmDeletion(args: Values, values: Values): Promise<void> {
      if (values.yes) return
      if (this.isUnattended()) {
        this.error('Deletion requires confirmation. Pass `--yes` to delete.', {
          exit: exitCodes.USAGE_ERROR,
        })
      }
      const target = operation.pathParams.map((param) => args[param.name]).findLast(Boolean)
      const confirmed = await confirm({
        default: false,
        message: `${operation.summary}${typeof target === 'string' ? ` "${target}"` : ''}?`,
      })
      if (!confirmed) {
        this.log('Nothing deleted')
        this.exit(exitCodes.USER_ABORT)
      }
    }

    /** Fail the command with the API's error message */
    public fail(error: unknown): never {
      // A usage error or a cancelled prompt is not a failed request
      if (
        error instanceof CLIError ||
        (error instanceof Error && error.name === 'ExitPromptError')
      ) {
        throw error
      }
      debug('Request failed', error)
      const notFound = isHttpError(error) && error.statusCode === 404
      this.error(
        `${notFound ? 'Not found' : `${operation.summary} failed`}: ${getErrorMessage(error)}`,
        {
          exit: exitCodes.RUNTIME_ERROR,
        },
      )
    }

    public async guard(args: Values, body: Values | undefined): Promise<void> {
      const knowledgeBaseId = stringValue(args, 'knowledgeBaseId')
      if (entry.guard !== 'knowledgeBaseBlueprint' || !knowledgeBaseId) return
      // A blueprint reconciles only some fields; changing the others is fine
      const guarded = entry.guardFields
      if (guarded && !guarded.some((name) => body?.[name] !== undefined)) return
      const ownership = await getKnowledgeBaseBlueprintOwnership(knowledgeBaseId)
      if (!ownership.managed) return
      const manager = describeBlueprintManager(ownership.stackName)
      this.error(
        operation.route.startsWith('DELETE ')
          ? `${manager} manages knowledge base "${knowledgeBaseId}". To delete it, deploy it with \`lifecycle: {deletionPolicy: 'allow'}\` in the blueprint, then remove it from the blueprint and deploy again.`
          : `${manager} manages the ${(guarded ?? []).join(' and ')} of knowledge base "${knowledgeBaseId}", so the next deploy would undo this change. Change them in the blueprint and run \`sanity blueprints deploy\` instead.`,
        {exit: exitCodes.USAGE_ERROR},
      )
    }

    /** Print the result: JSON with `--json`, otherwise a table or key-value lines */
    public render(result: unknown): void {
      if (this.flags.json) {
        this.logJson(result ?? {})
        return
      }
      this.log(renderOperationResult(result, {columns: entry.columns, summary: operation.summary}))
    }

    public async run(): Promise<void> {
      const values: Values = {...this.flags}
      const args: Values = {...this.args}
      const organizationId = needsOrganization(operation)
        ? await resolveOrganizationId({
            configuredOrganizationId: (await this.tryGetCliConfig()).app?.organizationId,
            flagOrganizationId: stringValue(values, 'organization'),
            unattended: this.isUnattended(),
          })
        : undefined

      for (const name of entry.prompt ?? []) {
        const flag = flagName({name})
        if (values[flag] === undefined && !this.isUnattended()) {
          values[flag] = await promptForText(`${humanize(name)}:`)
        }
      }

      let request: OperationRequest
      try {
        request = buildOperationRequest(operation, entry, {args, flags: values, organizationId})
      } catch (error) {
        this.error(getErrorMessage(error), {exit: exitCodes.USAGE_ERROR})
      }
      await this.guard(args, request.body)
      if (operation.route.startsWith('DELETE ')) await this.confirmDeletion(args, values)

      const knowledgeBaseId = stringValue(args, 'knowledgeBaseId')
      const watchedSource = stringValue(args, 'sourceId')
      const previousSyncId =
        entry.watch === 'sync' && values.watch && knowledgeBaseId && watchedSource
          ? await getSource(knowledgeBaseId, watchedSource).then(
              (source) => source.latestSync?.id ?? null,
              (error: unknown) => this.fail(error),
            )
          : null

      let result: unknown
      try {
        result = await this.send(request, values)
      } catch (error) {
        this.fail(error)
      }

      if (!values.watch || !knowledgeBaseId) {
        this.render(result)
        return
      }
      if (entry.watch === 'sync') {
        const sourceId = watchedSource ?? field(result, 'id')
        const syncId = field(record(result, 'latestSync'), 'id')
        const jobId = field(result, 'jobId')
        if (!sourceId) {
          this.render(result)
          return
        }
        if (!this.flags.json) this.render(result)
        await this.watchSync(
          knowledgeBaseId,
          sourceId,
          syncId ? {syncId} : jobId ? {jobId} : {previousSyncId},
        )
        return
      }
      const jobId = field(result, 'jobId') ?? stringValue(args, 'jobId')
      if (!jobId) {
        this.render(result)
        return
      }
      if (!this.flags.json) this.render(result)
      await this.watchJob(knowledgeBaseId, jobId)
    }

    /** Send the request; hand-written commands override this to upload a file or download bytes */
    public async send(request: OperationRequest, _flags: Values): Promise<unknown> {
      return operation.paginated
        ? requestAllPages(operation.route, request)
        : requestContext(operation.route, request)
    }

    public async watchJob(knowledgeBaseId: string, jobId: string): Promise<void> {
      let job
      try {
        job = await watchJob(knowledgeBaseId, jobId, {label: `Waiting for job ${jobId}`})
      } catch (error) {
        this.fail(error)
      }
      if (job.status !== 'succeeded') {
        if (this.flags.json)
          throw new JsonOutputError(formatJobFailure('Job', job), job, exitCodes.RUNTIME_ERROR)
        this.error(formatJobFailure('Job', job), {exit: exitCodes.RUNTIME_ERROR})
      }
      if (this.flags.json) this.logJson(job)
    }

    public async watchSync(
      knowledgeBaseId: string,
      sourceId: string,
      target: SyncTarget,
    ): Promise<void> {
      let sync
      try {
        sync = await watchSourceSync(knowledgeBaseId, sourceId, target)
      } catch (error) {
        this.fail(error)
      }
      if (sync.status === 'completed') {
        if (this.flags.json) this.logJson(sync)
        return
      }
      // A held sync waits on a decision, so a script must not read it as done
      const message =
        sync.status === 'held'
          ? (heldSyncHint(knowledgeBaseId, sync) ?? 'Sync held for confirmation')
          : formatSyncFailure(sync)
      if (this.flags.json) throw new JsonOutputError(message, sync, exitCodes.RUNTIME_ERROR)
      this.error(message, {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}
