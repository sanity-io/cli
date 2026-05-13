import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import open from 'open'
import {stringify as stringifyYaml} from 'yaml'

import {docsUrlFor} from '../../api/docsClient.js'
import {loadSingleSpecOrThrow, type ParsedOperation, type ParsedSpec} from '../../api/parser.js'
import {buildSpecJsonView, renderSpecHumanView} from '../../api/views.js'

export class ApiSpecCommand extends SanityCommand<typeof ApiSpecCommand> {
  static override args = {
    slug: Args.string({
      description: 'Spec slug (e.g. jobs, access-api, projects-api)',
      required: true,
    }),
  }

  static override description =
    'Inspect a public Sanity HTTP spec — human view (default), per-operation JSON, or raw OpenAPI YAML'

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
      description: 'Narrow any output mode to a single operation',
    },
    {
      command: '<%= config.bin %> <%= command.id %> agent-actions --schema GenerateInclude',
      description: 'Print one component schema by name (follow a `$ref` pointer)',
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
      const url = docsUrlFor(slug)
      this.log(`Opening ${url}`)
      await open(url)
      return
    }

    // `--operation` doesn't apply to the raw YAML passthrough — the
    // upstream YAML is byte-for-byte by design. Reject upfront so a
    // typo in `--operation` doesn't silently succeed.
    if (flags.format === 'openapi' && flags.operation) {
      this.error(
        '`--operation` is not compatible with `--format=openapi` — the raw OpenAPI ' +
          'YAML is a byte-for-byte passthrough. Drop one of the flags.',
        {exit: 1},
      )
    }

    const loaded = await loadSingleSpecOrThrow(slug)
    if (!loaded) {
      this.error(`Spec "${slug}" not found. Run \`sanity api list\` to see available specs.`, {
        exit: 1,
      })
    }

    if (flags.schema) {
      this.printSchema(slug, loaded.parsed.schemas, flags.schema, flags.format)
      return
    }

    // `openapi`: byte-for-byte passthrough of the upstream YAML.
    if (flags.format === 'openapi') {
      this.log(loaded.yaml)
      return
    }

    const operations = this.selectOperations(loaded.parsed, flags.operation)

    if (flags.format === 'json') {
      this.log(
        JSON.stringify(buildSpecJsonView(slug, loaded.index, loaded.parsed, operations), null, 2),
      )
      return
    }

    this.log(renderSpecHumanView(slug, loaded.index, loaded.parsed, operations))
  }

  private printSchema(
    slug: string,
    schemas: Record<string, unknown>,
    name: string,
    format: string | undefined,
  ): void {
    if (!(name in schemas)) {
      const known = Object.keys(schemas)
      this.error(
        `Schema "${name}" not found in spec "${slug}".\n` +
          `Known schemas: ${known.join(', ') || '(none)'}`,
        {exit: 1},
      )
    }
    const schema = schemas[name]
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
      const known = parsed.operations.map((o) => o.operationId)
      this.error(
        `Operation "${operationFilter}" not found in spec "${parsed.slug}".\n` +
          `Known operationIds: ${known.join(', ') || '(none)'}`,
        {exit: 1},
      )
    }
    return operations
  }
}
