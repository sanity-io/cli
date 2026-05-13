import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import open from 'open'

import {fetchSpecIndex, HTTP_REFERENCE_URL} from '../../api/docsClient.js'

const debug = subdebug('openapi:list')

interface OpenApiSpecRow {
  description: string
  slug: string
  title: string
}

/**
 * Deprecated. Preserved as a back-compat shim until the next major:
 *
 * - Output shape unchanged (one row per spec, `{title, slug, description}`).
 * - `--json` / `--web` / default human view behave as before.
 * - Adds a one-line stderr warning pointing users at the canonical
 *   `sanity api list` (which emits one row per operation — see #1068).
 *
 * Scripts that pipe stdout keep working; the deprecation surfaces
 * only on stderr.
 */
export class ListOpenApiCommand extends SanityCommand<typeof ListOpenApiCommand> {
  static override description =
    'DEPRECATED: list OpenAPI specifications (use `sanity api list` instead)'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'List all available OpenAPI specs',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --json',
      description: 'List with JSON output',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --web',
      description: 'Open HTTP Reference in browser',
    },
  ]

  static override flags = {
    json: Flags.boolean({description: 'Output JSON'}),
    web: Flags.boolean({char: 'w', description: 'Open HTTP Reference in web browser'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ListOpenApiCommand)

    this.warn(
      'sanity openapi list is deprecated, use sanity api list instead. ' +
        'Will be removed in the next major.',
    )

    if (flags.web) {
      this.log(`Opening ${HTTP_REFERENCE_URL}`)
      await open(HTTP_REFERENCE_URL)
      return
    }

    const specs = await this.loadSpecs()

    if (flags.json) {
      this.log(JSON.stringify(specs, null, 2))
      return
    }

    if (specs.length === 0) {
      this.log('No OpenAPI specifications available.')
      return
    }

    // Human-readable table format — byte-identical to the pre-deprecation output.
    this.log(`\nFound ${specs.length} OpenAPI specification(s):\n`)

    for (const spec of specs) {
      this.log(`Title: ${spec.title}`)
      this.log(`Slug: ${spec.slug}`)
      if (spec.description) {
        this.log(`Description: ${spec.description}`)
      }
      this.log('')
    }

    this.log(`Use 'sanity openapi get <slug>' to retrieve a specific specification.`)
  }

  private async loadSpecs(): Promise<OpenApiSpecRow[]> {
    try {
      const index = await fetchSpecIndex()
      return index.map(({description, slug, title}) => ({description, slug, title}))
    } catch (error) {
      debug('openapi list failed', error)
      this.error('The OpenAPI service is currently unavailable. Try again later.', {exit: 1})
    }
  }
}
