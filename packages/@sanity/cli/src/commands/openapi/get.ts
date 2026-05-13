import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import open from 'open'

import {docsUrlFor, fetchSpec} from '../../api/docsClient.js'
import {DOCS_SERVICE_UNAVAILABLE} from '../../api/parser.js'

const debug = subdebug('openapi:get')

/**
 * Deprecated. Preserved as a back-compat shim until the next major:
 *
 * - Output shape unchanged (raw OpenAPI spec body, YAML by default).
 * - `--format=yaml` / `--format=json` / `--web` behave as before.
 * - Adds a one-line stderr warning pointing users at the canonical
 *   `sanity api spec` (which emits a structured per-operation view).
 *
 * The new structured output lives on `sanity api spec <slug>` —
 * default human view, `--format=json` per-op JSON, `--format=openapi`
 * raw YAML. This forwarder keeps the legacy passthrough so scripts
 * piping stdout keep working.
 */
export class GetOpenApiCommand extends SanityCommand<typeof GetOpenApiCommand> {
  static override args = {
    slug: Args.string({
      description: 'Slug of the OpenAPI specification to retrieve',
      required: true,
    }),
  }

  static override description =
    'DEPRECATED: get an OpenAPI specification by slug (use `sanity api spec` instead)'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> query',
      description: 'Get a specification (YAML format, default)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> query --format=json',
      description: 'Get specification in JSON format',
    },
    {
      command: '<%= config.bin %> <%= command.id %> query --web',
      description: 'Open specification in browser',
    },
    {
      command: '<%= config.bin %> <%= command.id %> query > query-api.yaml',
      description: 'Pipe to file',
    },
  ]

  static override flags = {
    format: Flags.string({
      default: 'yaml',
      description: 'Output format: yaml (default), json',
      options: ['yaml', 'json'],
    }),
    web: Flags.boolean({char: 'w', description: 'Open in web browser'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(GetOpenApiCommand)
    const {slug} = args
    const {format, web} = flags

    this.warn(
      'sanity openapi get is deprecated, use sanity api spec instead. ' +
        'Will be removed in the next major.',
    )

    if (web) {
      const url = docsUrlFor(slug)
      this.log(`Opening ${url}`)
      await open(url)
      return
    }

    let body: string | null
    try {
      body = await fetchSpec(slug, {format: format as 'json' | 'yaml'})
    } catch (error) {
      debug('openapi get fetch failed', error)
      this.error(DOCS_SERVICE_UNAVAILABLE, {exit: 1})
    }
    if (body === null) {
      this.error(`OpenAPI specification "${slug}" not found.`, {exit: 1})
    }
    this.log(body)
  }
}
