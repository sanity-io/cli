import {Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import open from 'open'

interface OpenAPISpec {
  description: string
  slug: string
  title: string
}

const listOpenapiDebug = subdebug('openapi:list')

export class ListOpenApiCommand extends SanityCommand<typeof ListOpenApiCommand> {
  static override description = 'List all available OpenAPI specifications'

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
    json: Flags.boolean({
      description: 'Output JSON',
    }),
    web: Flags.boolean({
      char: 'w',
      description: 'Open HTTP Reference in web browser',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(ListOpenApiCommand)
    const {json, web} = flags

    if (web) {
      const url = 'https://www.sanity.io/docs/http-reference'
      this.log(`Opening ${url}`)
      await open(url)
      return
    }

    let specs: OpenAPISpec[]
    try {
      specs = await this.getSpecs()
    } catch (error) {
      listOpenapiDebug('Error fetching OpenAPI specs', error)

      this.error('The OpenAPI service is currently unavailable. Please try again later.', {
        exit: 1,
      })
    }

    if (json) {
      this.log(JSON.stringify(specs, null, 2))
      return
    }

    if (specs.length === 0) {
      this.log('No OpenAPI specifications available.')
      return
    }

    // Human-readable table format
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

  private async getSpecs(): Promise<OpenAPISpec[]> {
    const response = await fetch('https://www.sanity.io/docs/api/openapi', {
      signal: AbortSignal.timeout(10_000),
    })

    if (response.ok) {
      const data = await response.json()
      return Array.isArray(data?.specs) ? data.specs : []
    }

    throw response
  }
}
