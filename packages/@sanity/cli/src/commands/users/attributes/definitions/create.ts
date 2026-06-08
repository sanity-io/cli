import {Flags} from '@oclif/core'
import {colorizeJson, NonInteractiveError, SanityCommand, subdebug} from '@sanity/cli-core'

import {promptForOrganization} from '../../../../prompts/promptForOrganization.js'
import {type AttributeType, createAttributeDefinition} from '../../../../services/userAttributes.js'
import {getErrorMessage} from '../../../../util/getErrorMessage.js'
import {getOrganizationFlag} from '../../../../util/sharedFlags.js'

const debug = subdebug('users:attributes:definitions:create')

const ATTRIBUTE_TYPES: AttributeType[] = [
  'string',
  'string-array',
  'integer',
  'integer-array',
  'number',
  'number-array',
  'boolean',
]

export class UserAttributeDefinitionsCreateCommand extends SanityCommand<
  typeof UserAttributeDefinitionsCreateCommand
> {
  static override description = 'Create a user attribute definition for an organization'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> --key location --type string',
      description:
        'Create a string attribute definition (prompts for an organization in interactive mode)',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --organization o123 --key location --type string',
      description: 'Create a string attribute definition in a specific organization',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --organization o123 --key departments --type string-array --json',
      description: 'Create a string-array attribute definition and output as JSON',
    },
  ]

  static override flags = {
    ...getOrganizationFlag({
      description: 'Organization ID to create the attribute definition in',
      semantics: 'specify',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output result in JSON format',
    }),
    key: Flags.string({
      description: 'Attribute key (name)',
      helpValue: '<key>',
      required: true,
    }),
    type: Flags.string({
      description: 'Attribute type',
      helpValue: '<type>',
      options: ATTRIBUTE_TYPES,
      required: true,
    }),
  }

  static override hiddenAliases: string[] = ['user:attributes:definitions:create']

  public async run(): Promise<void> {
    const {json: outputJson, key, organization: organizationFlag, type} = this.flags

    let orgId: string
    if (organizationFlag) {
      orgId = organizationFlag
    } else {
      try {
        orgId = await promptForOrganization()
      } catch (err) {
        if (err instanceof NonInteractiveError) {
          this.error('Organization ID is required. Use --organization to specify it.', {exit: 1})
        }
        throw err
      }
    }

    let result: Awaited<ReturnType<typeof createAttributeDefinition>>
    try {
      result = await createAttributeDefinition(orgId, key, type as AttributeType)
    } catch (err) {
      debug('Error creating attribute definition', err)
      this.error(`Failed to create attribute definition:\n${getErrorMessage(err)}`, {exit: 1})
    }

    if (outputJson) {
      this.log(colorizeJson(result))
      return
    }

    if (result.alreadyExists) {
      this.log(`User attribute definition "${key}" already exists (type: ${result.type}).`)
    } else {
      this.log(`User attribute definition "${key}" created successfully (type: ${result.type}).`)
    }
  }
}
