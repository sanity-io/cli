import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'

import {ApiSpecCommand} from '../api/spec.js'

/**
 * Deprecation forwarder.
 *
 * `sanity openapi get <slug>` is the legacy name for what is now
 * `sanity api spec <slug>`. The forwarder prints a stderr warning,
 * translates the legacy `--format=yaml|json` flag to the canonical
 * `--format=openapi|json`, and delegates. Removed in the next major.
 *
 * **Behavior changes called out in release notes:**
 *
 * - The default output (no flag) changes from raw OpenAPI YAML to the
 *   structured human view. Users who want the old YAML behavior pass
 *   `--format=yaml` (translated to `--format=openapi`).
 * - The `--format=json` value's semantics flip from "raw OpenAPI as JSON"
 *   to "structured per-operation JSON". For the old behavior, parse the
 *   raw YAML and convert externally (e.g. via `yq -o=json`).
 */
export class GetOpenApiCommand extends SanityCommand<typeof GetOpenApiCommand> {
  static override args = {
    slug: Args.string({
      description: 'Slug of the OpenAPI specification to retrieve',
      required: true,
    }),
  }

  static override description =
    'DEPRECATED: inspect an OpenAPI specification by slug (use `sanity api spec` instead)'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> jobs',
      description: 'Forwards to `sanity api spec jobs` (default human view)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> jobs --format=yaml',
      description: 'Forwards to `sanity api spec jobs --format=openapi` (raw YAML)',
    },
  ]

  static override flags = {
    format: Flags.string({
      description:
        'Legacy: yaml (raw OpenAPI) or json (structured per-op). Prefer `--format=openapi|json` on the new command.',
      options: ['json', 'yaml'],
    }),
    web: Flags.boolean({char: 'w', description: 'Open in web browser'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(GetOpenApiCommand)
    this.warn(
      'sanity openapi get is deprecated, use sanity api spec instead. ' +
        'Will be removed in the next major.',
    )

    const argv: string[] = [args.slug]
    if (flags.format === 'yaml') {
      argv.push('--format=openapi')
    } else if (flags.format === 'json') {
      argv.push('--format=json')
    }
    if (flags.web) argv.push('--web')

    await ApiSpecCommand.run(argv, this.config)
  }
}
