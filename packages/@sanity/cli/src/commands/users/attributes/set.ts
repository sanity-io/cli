import {Flags} from '@oclif/core'
import {NonInteractiveError, SanityCommand, subdebug} from '@sanity/cli-core'
import {Table} from 'console-table-printer'

import {type SetAttributeInput} from '../../../actions/userAttributes/types.js'
import {promptForOrganization} from '../../../prompts/promptForOrganization.js'
import {updateUserAttributes} from '../../../services/userAttributes.js'
import {formatAttributeValue} from '../../../util/formatAttributeValue.js'
import {getErrorMessage} from '../../../util/getErrorMessage.js'
import {getOrgIdFlag} from '../../../util/sharedFlags.js'

const debug = subdebug('users:attributes:set')

export class UserAttributesSetCommand extends SanityCommand<typeof UserAttributesSetCommand> {
  static override description = 'Set attribute values for a user within an organization'

  static override examples = [
    {
      command:
        '<%= config.bin %> <%= command.id %> --org-id o123 --user-id u456 --attributes \'[{"key":"location","value":"UK"}]\'',
      description: 'Set a single attribute for a user',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --org-id o123 --user-id u456 --attributes \'[{"key":"location","value":"UK"},{"key":"year_started","value":2020}]\'',
      description: 'Set multiple attributes for a user',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --org-id o123 --user-id u456 --attributes \'[{"key":"departments","value":["hr","sales"]}]\' --json',
      description: 'Set an array attribute and output result as JSON',
    },
  ]

  static override flags = {
    ...getOrgIdFlag({
      description: 'Organization ID',
      semantics: 'specify',
    }),
    attributes: Flags.string({
      description: 'JSON array of attributes to set, e.g. \'[{"key":"location","value":"UK"}]\'',
      helpValue: '<json>',
      required: true,
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output result in JSON format',
    }),
    'user-id': Flags.string({
      description: 'User ID to set attributes for',
      helpValue: '<userId>',
      required: true,
    }),
  }

  static override hiddenAliases: string[] = ['user:attributes:set']

  public async run(): Promise<void> {
    const {
      attributes: attributesJson,
      json: outputJson,
      'org-id': orgIdFlag,
      'user-id': userId,
    } = this.flags

    let orgId: string
    if (orgIdFlag) {
      orgId = orgIdFlag
    } else {
      try {
        orgId = await promptForOrganization()
      } catch (err) {
        if (err instanceof NonInteractiveError) {
          this.error('Organization ID is required. Use --org-id to specify it.', {exit: 1})
        }
        throw err
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(attributesJson)
    } catch (err) {
      if (err instanceof SyntaxError) {
        this.error(`--attributes is not valid JSON: ${err.message}`, {exit: 1})
      }
      throw err
    }

    if (!Array.isArray(parsed)) {
      this.error('--attributes must be a JSON array', {exit: 1})
    }

    for (const item of parsed) {
      if (typeof item !== 'object' || item === null || !('key' in item) || !('value' in item)) {
        this.error('Each item in --attributes must have "key" and "value" fields', {exit: 1})
      }
    }

    const attributes = parsed as SetAttributeInput[]

    let result: Awaited<ReturnType<typeof updateUserAttributes>>
    try {
      result = await updateUserAttributes(orgId, userId, attributes)
    } catch (err) {
      debug('Error setting user attributes', err)
      this.error(`Failed to set attributes:\n${getErrorMessage(err)}`, {exit: 1})
    }

    if (outputJson) {
      this.log(JSON.stringify(result, null, 2))
      return
    }

    this.log(`Attributes updated successfully for user ${result.sanityUserId}.`)

    if (result.attributes.length === 0) {
      return
    }

    const table = new Table({
      columns: [
        {alignment: 'left', maxLen: 40, name: 'key', title: 'Key'},
        {alignment: 'left', maxLen: 15, name: 'type', title: 'Type'},
        {alignment: 'left', maxLen: 10, name: 'activeSource', title: 'Source'},
        {alignment: 'left', maxLen: 40, name: 'activeValue', title: 'Active Value'},
      ],
    })

    for (const attr of result.attributes) {
      table.addRow({
        activeSource: attr.activeSource,
        activeValue: formatAttributeValue(attr.activeValue),
        key: attr.key,
        type: attr.type,
      })
    }

    table.printTable()
  }
}
