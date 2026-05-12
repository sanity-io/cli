import {Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {ApiListCommand} from '../api/list.js'

/**
 * Deprecation forwarder.
 *
 * `sanity openapi list` is the legacy name for what is now `sanity api list`.
 * This command prints a one-line deprecation warning to stderr, then
 * delegates to the canonical implementation. Removed in the next major.
 */
export class ListOpenApiCommand extends SanityCommand<typeof ListOpenApiCommand> {
  static override description =
    'DEPRECATED: list OpenAPI specifications (use `sanity api list` instead)'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Forwards to `sanity api list`',
    },
  ]

  static override flags = {
    json: Flags.boolean({description: 'Emit JSON'}),
    web: Flags.boolean({char: 'w', description: 'Open the HTTP Reference in browser'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ListOpenApiCommand)
    this.warn(
      'sanity openapi list is deprecated, use sanity api list instead. ' +
        'Will be removed in the next major.',
    )

    const argv: string[] = []
    if (flags.json) argv.push('--json')
    if (flags.web) argv.push('--web')

    await ApiListCommand.run(argv, this.config)
  }
}
