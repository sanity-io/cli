import {Args, Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type Context, isHttpError} from '@sanity/client'

import {apiErrorCode} from '../../../actions/context/apiErrorCode.js'
import {
  CRAWL_FLAG_NAMES,
  crawlFlags,
  crawlOptionsFromFlags,
} from '../../../actions/context/crawlFlags.js'
import {editSource, getSource} from '../../../services/context.js'
import {defineCommandTelemetry} from '../../../util/telemetry/commandTelemetry.js'

const editSourceDebug = subdebug('context:sources:edit')

const EDIT_FLAGS = ['title', 'query', 'sync-frequency', ...CRAWL_FLAG_NAMES]

const flags = {
  ...crawlFlags,
  'confirm-deletions': Flags.boolean({
    default: false,
    description:
      'Apply crawl options that delete more than a fifth of the documents, or all of them',
  }),
  query: Flags.string({
    atLeastOne: EDIT_FLAGS,
    description:
      'New GROQ query for a dataset source; a sync removes the documents it no longer returns',
    helpValue: '<groq>',
  }),
  'sync-frequency': Flags.custom<'monthly' | 'off' | 'weekly'>({
    atLeastOne: EDIT_FLAGS,
    description: 'How often a website or dataset source syncs on its own',
    options: ['weekly', 'monthly', 'off'],
  })(),
  title: Flags.string({
    atLeastOne: EDIT_FLAGS,
    description: 'New source title',
  }),
} satisfies FlagInput

export class EditSourceCommand extends SanityCommand<typeof EditSourceCommand> {
  static override args = {
    knowledgeBaseId: Args.string({
      description: 'Knowledge base ID',
      required: true,
    }),

    sourceId: Args.string({
      description: 'Source ID',
      required: true,
    }),
  }

  static override description =
    "Change a source's title, crawl options, dataset query or sync frequency"

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --title "Product docs"',
      description: 'Rename a source',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --sync-frequency weekly',
      description: 'Sync a website or dataset every week',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> kb-abc123 source-def456 --exclude-path "^/blog/" --confirm-deletions',
      description: 'Stop crawling the blog and delete its pages, however many there are',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {
    redact: ['exclude-path', 'include-path', 'query', 'title'],
  })

  public async run(): Promise<void> {
    const {knowledgeBaseId, sourceId} = this.args
    const {
      'confirm-deletions': confirmDeletions,
      query,
      'sync-frequency': syncFrequency,
      title,
    } = this.flags

    const params: Context.EditSourceParams = {}
    if (title !== undefined) {
      const trimmed = title.trim()
      if (trimmed === '') {
        this.error('Title cannot be empty', {exit: exitCodes.USAGE_ERROR})
      }
      params.title = trimmed
    }
    if (query !== undefined) {
      if (query.trim() === '') {
        this.error('Query cannot be empty', {exit: exitCodes.USAGE_ERROR})
      }
      params.query = query
    }
    if (syncFrequency !== undefined) {
      params.syncFrequency = syncFrequency === 'off' ? null : syncFrequency
    }
    if (confirmDeletions) {
      params.confirmDeletions = true
    }

    const spin = spinner('Updating source').start()
    try {
      const crawlOptions = crawlOptionsFromFlags(this.flags)
      if (crawlOptions) {
        // The API replaces the stored crawl options, so unchanged ones are sent back as they are
        const source = await getSource(knowledgeBaseId, sourceId)
        params.crawlOptions = {
          ...(source.type === 'web' ? source.crawlOptions : {}),
          ...crawlOptions,
        }
      }
      await editSource(knowledgeBaseId, sourceId, params)
      spin.succeed('Source updated')
    } catch (error) {
      spin.fail()
      editSourceDebug('Error updating source', error)
      if (isHttpError(error) && error.statusCode === 404) {
        this.error(`Source "${sourceId}" not found on knowledge base "${knowledgeBaseId}"`, {
          exit: exitCodes.RUNTIME_ERROR,
        })
      }
      if (apiErrorCode(error) === 'sourceDeletionsUnconfirmed') {
        this.error(
          `${getErrorMessage(error)}\nRun again with --confirm-deletions to apply the change and delete those documents.`,
          {exit: exitCodes.RUNTIME_ERROR},
        )
      }
      this.error(`Failed to update source: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}
