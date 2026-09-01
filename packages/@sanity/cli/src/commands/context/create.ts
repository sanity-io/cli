import {Flags} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {requiredWhenUnattended} from '@sanity/cli-core/flags'
import {input, spinner} from '@sanity/cli-core/ux'

import {
  MissingOrganizationError,
  resolveOrganizationId,
} from '../../actions/context/resolveOrganizationId.js'
import {formatKeyValue} from '../../actions/debug/output.js'
import {createKnowledgeBase} from '../../services/context.js'
import {getOrganizationFlag} from '../../util/sharedFlags.js'
import {defineCommandTelemetry} from '../../util/telemetry/commandTelemetry.js'

const createContextDebug = subdebug('context:create')

const flags = {
  ...getOrganizationFlag({
    description: 'Organization to create the knowledge base in',
    semantics: 'override',
  }),
  description: requiredWhenUnattended(
    Flags.string({
      description: 'Knowledge base description',
    }),
  ),
  title: requiredWhenUnattended(
    Flags.string({
      description: 'Knowledge base title',
    }),
  ),
} satisfies FlagInput

export class CreateKnowledgeBaseCommand extends SanityCommand<typeof CreateKnowledgeBaseCommand> {
  static override description = 'Create a knowledge base'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Interactively create a knowledge base',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --organization org-abc123 --title "Support docs" --description "Product docs and troubleshooting guides"',
      description: 'Create a knowledge base in a specific organization',
    },
  ]

  static override flags = flags

  static telemetry = defineCommandTelemetry(flags, {redact: ['title', 'description']})

  public async run(): Promise<void> {
    const {description: descriptionFlag, organization, title: titleFlag} = this.flags

    if (titleFlag !== undefined && titleFlag.trim() === '') {
      this.error('Title cannot be empty', {exit: exitCodes.USAGE_ERROR})
    }
    if (descriptionFlag !== undefined && descriptionFlag.trim() === '') {
      this.error('Description cannot be empty', {exit: exitCodes.USAGE_ERROR})
    }

    let organizationId: string
    try {
      organizationId = await resolveOrganizationId({
        configuredOrganizationId: (await this.tryGetCliConfig()).app?.organizationId,
        flagOrganizationId: organization,
        unattended: this.isUnattended(),
      })
    } catch (error) {
      createContextDebug('Error resolving organization', error)
      this.error(getErrorMessage(error), {
        exit:
          error instanceof MissingOrganizationError
            ? exitCodes.USAGE_ERROR
            : exitCodes.RUNTIME_ERROR,
      })
    }

    const title = titleFlag?.trim() || (await promptForText('Knowledge base title:'))
    const description =
      descriptionFlag?.trim() || (await promptForText('Knowledge base description:'))

    const spin = spinner('Creating knowledge base').start()
    try {
      const knowledgeBase = await createKnowledgeBase({description, organizationId, title})
      spin.succeed('Knowledge base created')
      const padTo = 12 // "Organization" is the longest key
      this.log(formatKeyValue('ID', knowledgeBase.publicId, {padTo}))
      this.log(formatKeyValue('Title', knowledgeBase.title, {padTo}))
      this.log(formatKeyValue('Organization', knowledgeBase.organizationId, {padTo}))
    } catch (error) {
      spin.fail()
      createContextDebug('Error creating knowledge base', error)
      this.error(`Failed to create knowledge base: ${getErrorMessage(error)}`, {
        exit: exitCodes.RUNTIME_ERROR,
      })
    }
  }
}

async function promptForText(message: string): Promise<string> {
  const value = await input({
    message,
    validate: (input_) => input_.trim().length > 0 || 'Value cannot be empty',
  })
  return value.trim()
}
