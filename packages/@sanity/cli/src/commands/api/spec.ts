import {Args, Flags} from '@oclif/core'
import {SanityCommand, subdebug} from '@sanity/cli-core'
import open from 'open'
import {stringify as stringifyYaml} from 'yaml'

import {readSpec} from '../../api/cache.js'
import {type OpenApiSpecIndexEntry} from '../../api/docsClient.js'
import {
  listComponentSchemas,
  lookupComponentSchema,
  type ParsedOperation,
  type ParsedSpec,
  parseOpenApi,
} from '../../api/parser.js'
import {revalidateSpecs} from '../../api/revalidate.js'
import {buildSpecJsonView, renderSpecHumanView} from '../../api/views.js'

const debug = subdebug('api:spec')

const HTTP_REFERENCE_BASE_URL = 'https://www.sanity.io/docs/http-reference'

export class ApiSpecCommand extends SanityCommand<typeof ApiSpecCommand> {
  static override args = {
    slug: Args.string({
      description: 'Spec slug (e.g. jobs, access-api, projects-api)',
      required: true,
    }),
  }

  static override description =
    'Inspect a public Sanity HTTP spec — structured human view, structured JSON, or raw OpenAPI'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> jobs',
      description: 'Default: human-readable structured view of every operation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> jobs --format=json',
      description: 'Structured per-operation JSON (agent-friendly)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> jobs --format=openapi',
      description: 'Raw OpenAPI YAML — the canonical spec source',
    },
    {
      command: '<%= config.bin %> <%= command.id %> jobs --operation=jobStatus',
      description: 'Narrow any of the three output modes to one operation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> agent-actions --schema GenerateInclude',
      description: 'Print one component schema by name (resolves a `$ref` an op points at)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> jobs --web',
      description: 'Open the spec docs page in browser',
    },
  ]

  static override flags = {
    format: Flags.string({
      description:
        'Output mode. Default (no flag) is the human view. ' +
        '`json` = structured per-operation JSON. `openapi` = raw OpenAPI YAML.',
      options: ['json', 'openapi'],
    }),
    operation: Flags.string({description: 'Narrow to a single operation by operationId'}),
    schema: Flags.string({
      description:
        'Print one `components.schemas.<name>` entry. Use this to follow `$ref` pointers ' +
        'surfaced in operation output. Honors `--format` (default: YAML).',
    }),
    web: Flags.boolean({char: 'w', description: 'Open the spec docs page in browser'}),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ApiSpecCommand)
    const slug = args.slug

    if (flags.web) {
      const url = `${HTTP_REFERENCE_BASE_URL}/${slug}`
      this.log(`Opening ${url}`)
      await open(url)
      return
    }

    const {entry, yaml} = await this.loadSpec(slug)

    if (flags.schema) {
      this.printSchema(slug, yaml, flags.schema, flags.format)
      return
    }

    // openapi: byte-for-byte passthrough of the cached YAML.
    if (flags.format === 'openapi') {
      this.log(yaml)
      return
    }

    const parsed = parseOpenApi(slug, yaml)
    const operations = this.selectOperations(parsed, flags.operation)

    if (flags.format === 'json') {
      this.log(JSON.stringify(buildSpecJsonView(slug, entry, parsed, operations), null, 2))
      return
    }

    this.log(renderSpecHumanView(slug, entry, parsed, operations))
  }

  private async loadSpec(slug: string): Promise<{entry: OpenApiSpecIndexEntry; yaml: string}> {
    let entry: OpenApiSpecIndexEntry | undefined
    let yaml: string | null = null
    let fetchFailed = false
    try {
      const {index} = await revalidateSpecs({onlySlug: slug})
      entry = index.find((e) => e.slug === slug)
      if (entry) {
        yaml = await readSpec(slug)
      }
    } catch (error) {
      debug('spec failed', error)
      fetchFailed = true
    }

    if (fetchFailed) {
      this.error('The OpenAPI service is currently unavailable. Try again later.', {
        exit: 1,
      })
    }
    if (!entry) {
      this.error(`Spec "${slug}" not found. Run \`sanity api list\` to see available specs.`, {
        exit: 1,
      })
    }
    if (yaml === null) {
      this.error(
        `Spec "${slug}" not found in cache after revalidation. The spec may have been removed upstream — try again, or run \`sanity api list\` to see current specs.`,
        {exit: 1},
      )
    }

    return {entry, yaml}
  }

  private printSchema(slug: string, yaml: string, name: string, format: string | undefined): void {
    const schema = lookupComponentSchema(yaml, name)
    if (schema === null) {
      const known = listComponentSchemas(yaml)
      this.error(
        `Schema "${name}" not found in spec "${slug}".\n` +
          `Known schemas: ${known.join(', ') || '(none)'}`,
        {exit: 1},
      )
    }
    if (format === 'json') {
      this.log(JSON.stringify(schema, null, 2))
      return
    }
    this.log(stringifyYaml(schema))
  }

  private selectOperations(parsed: ParsedSpec, operationFilter?: string): ParsedOperation[] {
    if (!operationFilter) return parsed.operations
    const operations = parsed.operations.filter((op) => op.operationId === operationFilter)
    if (operations.length === 0) {
      const known = parsed.operations.map((o) => o.operationId).filter((id) => id.length > 0)
      this.error(
        `Operation "${operationFilter}" not found in spec "${parsed.slug}".\n` +
          `Known operationIds: ${known.join(', ') || '(none)'}`,
        {exit: 1},
      )
    }
    return operations
  }
}
