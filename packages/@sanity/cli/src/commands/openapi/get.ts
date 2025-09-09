import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import open from 'open'

const getOpenapiDebug = subdebug('openapi:get')

export class GetOpenApiCommand extends SanityCommand<typeof GetOpenApiCommand> {
  static override args = {
    slug: Args.string({
      description: 'Slug of the OpenAPI specification to retrieve',
      required: true,
    }),
  }

  static override description = 'Get an OpenAPI specification by slug'

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
    web: Flags.boolean({
      char: 'w',
      description: 'Open in web browser',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(GetOpenApiCommand)
    const {slug} = args
    const {format, web} = flags

    if (web) {
      const url = `https://www.sanity.io/docs/http-reference/${slug}`
      this.log(`Opening ${url}`)
      await open(url)
      return
    }

    try {
      const specContent = await this.getSpecContent(slug, format)

      this.log(specContent)
    } catch (error) {
      getOpenapiDebug(`Error fetching OpenAPI spec ${slug}`, error)

      if (error instanceof Response && error.status === 404) {
        this.error(`OpenAPI specification not found. ${slug}`, {exit: 1})
      }

      this.error('The OpenAPI service is currently unavailable. Please try again later.', {
        exit: 1,
      })
    }
  }

  private async getSpecContent(slug: string, format: string): Promise<string> {
    const url = new URL(`https://www.sanity.io/docs/api/openapi/${slug}`)
    url.searchParams.set('format', format)
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    })

    if (response.ok) {
      return response.text()
    }

    throw response
  }
}
