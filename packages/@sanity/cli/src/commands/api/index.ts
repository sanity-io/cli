import {Args, Flags} from '@oclif/core'
import {getCliToken, SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

import {loadOperationsIndex, type OperationIndexEntry} from '../../api/parser.js'
import {buildQueryString, sendApiRequest} from '../../api/request.js'
import {
  fillPlaceholders,
  findUnfilledPlaceholders,
  resolveEndpoint,
} from '../../api/resolveEndpoint.js'

const debug = subdebug('api:call')

const DESTRUCTIVE_METHODS = new Set(['DELETE', 'PATCH', 'PUT'])
const BODY_METHODS = new Set(['PATCH', 'POST', 'PUT'])

/**
 * Default command for the `api` topic — `sanity api <endpoint>`.
 *
 * Routes when the user's first argument doesn't match a known
 * subcommand (`list`, `spec`). Takes the verbatim endpoint string
 * that `sanity api list` rendered, plus standard request flags
 * (`-X`, `-q`, `--token`, `--project`, `--dataset`, `--json`, `--yes`).
 *
 * Phase 2 of the spec — see [spec doc, Phase 2]. POST/PUT/PATCH with
 * no body flags error before sending and name Phase 4 (body
 * construction). Destructive ops (PATCH/PUT/DELETE) prompt
 * interactively, refuse in unattended mode without `--yes`.
 */
export class ApiCallCommand extends SanityCommand<typeof ApiCallCommand> {
  static override args = {
    endpoint: Args.string({
      description: 'Endpoint string from `sanity api list` (e.g. `v2021-06-07/jobs/abc123`)',
      required: true,
    }),
  }

  static override description =
    'Execute a request against the Sanity HTTP API. Pass the endpoint string from `sanity api list`.'

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> v2021-06-07/jobs/abc123',
      description: 'GET an endpoint (default method)',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> v2024-01-01/data/query/:dataset -q "query=*[0]"',
      description: 'Pass query params via flag (CLI URL-encodes the value)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --project=xyz v2024-01-01/projects/:projectId',
      description: 'Auto-fill :projectId / :dataset placeholders from flags',
    },
    {
      command: '<%= config.bin %> <%= command.id %> -X DELETE v2024-01-01/projects/abc --yes',
      description: 'Destructive ops (PATCH/PUT/DELETE) need --yes in unattended contexts',
    },
  ]

  static override flags = {
    dataset: Flags.string({description: 'Fills `:dataset` placeholders in host or path'}),
    json: Flags.boolean({
      description: 'Emit the raw response body verbatim (default: pretty-printed JSON)',
    }),
    method: Flags.string({
      char: 'X',
      default: 'GET',
      description: 'HTTP method',
      options: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
    project: Flags.string({description: 'Fills `:projectId` placeholders in host or path'}),
    query: Flags.string({
      char: 'q',
      description: 'Repeatable `key=value` query parameter (CLI URL-encodes the value)',
      multiple: true,
    }),
    token: Flags.string({description: 'Override the stored auth token for this call'}),
    yes: Flags.boolean({
      char: 'y',
      description: 'Confirm destructive operations without prompting',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ApiCallCommand)

    const index = await this.loadIndex()
    const matched = this.resolveMatch(args.endpoint, flags.method, index)
    const {inlineQuery, operation, path} = matched

    // Body methods without `-f`/`-F`/`--input` (which ship in Phase 4)
    // get a clean upfront error — fires before the destructive guard so
    // we don't mask the missing-body case for PATCH/PUT.
    if (BODY_METHODS.has(operation.method)) {
      this.error(
        `${operation.method} needs a request body. ` +
          'Body construction (`-f`, `-F`, `--input`) ships in Phase 4.',
        {exit: 1},
      )
    }

    const contextValues = this.collectContextValues(flags)
    const resolvedPath = fillPlaceholders(path, contextValues)
    const resolvedHost = fillPlaceholders(operation.serverTemplate, contextValues)

    this.assertNoUnfilledPlaceholders(resolvedPath, resolvedHost, operation)
    this.assertRequiredQueryParamsPresent(operation, inlineQuery, flags.query ?? [])

    const queryString = buildQueryString(inlineQuery, flags.query ?? [])
    const url = this.buildOutboundUrl(resolvedHost, resolvedPath, queryString)

    if (DESTRUCTIVE_METHODS.has(operation.method)) {
      await this.confirmDestructive(operation.method, url, flags.yes ?? false)
    }

    const token = await this.resolveToken(flags.token)
    const response = await this.sendRequest({method: operation.method, token, url})
    this.renderResponse(response, flags.json ?? false)
  }

  /* -------------------------------------------------------------------- *
   *  Resolution                                                           *
   * -------------------------------------------------------------------- */

  private assertNoUnfilledPlaceholders(
    resolvedPath: string,
    resolvedHost: string,
    operation: OperationIndexEntry,
  ): void {
    const unfilled = [
      ...findUnfilledPlaceholders(resolvedPath),
      ...findUnfilledPlaceholders(resolvedHost),
    ]
    if (unfilled.length === 0) return

    const unique = [...new Set(unfilled)]
    const contextHints = unique.filter((name) =>
      ['dataset', 'organizationId', 'projectId'].includes(name),
    )
    const nonContext = unique.filter((name) => !contextHints.includes(name))

    const lines = [`Unfilled path placeholder(s): ${unique.map((n) => `:${n}`).join(', ')}`]
    if (contextHints.length > 0) {
      lines.push(
        `Hint: pass --${contextHints[0] === 'projectId' ? 'project' : contextHints[0]}=<value>, ` +
          `set SANITY_${contextHints[0] === 'projectId' ? 'PROJECT_ID' : contextHints[0].toUpperCase()}, ` +
          'or run from a directory with `sanity.cli.ts`.',
      )
    }
    if (nonContext.length > 0) {
      lines.push(
        `Hint: substitute the value directly in the endpoint string ` +
          `(e.g. ${operation.endpoint.replaceAll(/:(\w+)/g, '<$1>')}).`,
      )
    }
    this.error(lines.join('\n'), {exit: 1})
  }

  private assertRequiredQueryParamsPresent(
    operation: OperationIndexEntry,
    inlineQuery: string,
    flagPairs: readonly string[],
  ): void {
    const provided = new Set<string>()
    if (inlineQuery) for (const [key] of new URLSearchParams(inlineQuery)) provided.add(key)
    for (const pair of flagPairs) {
      const eq = pair.indexOf('=')
      if (eq !== -1) provided.add(pair.slice(0, eq))
    }

    const missing = operation.queryParams
      .filter((p) => p.required && !provided.has(p.name))
      .map((p) => p.name)
    if (missing.length === 0) return

    this.error(
      `Missing required query parameter(s): ${missing.join(', ')}\n` +
        `Hint: pass with -q name=value. See: sanity api spec ${operation.spec} ` +
        `--operation=${operation.operationId} --format=json`,
      {exit: 1},
    )
  }

  /* -------------------------------------------------------------------- *
   *  Placeholders / pre-flight validation                                 *
   * -------------------------------------------------------------------- */

  private buildOutboundUrl(host: string, path: string, queryString: string): string {
    // `host` already includes the api-version segment from the server
    // URL. `path` starts with the api-version segment too — strip the
    // overlap before concatenating.
    const hostPath = new URL(host).pathname.replaceAll(/^\/+|\/+$/g, '')
    const cleanPath = path.replace(/^\/+/, '')
    const relative =
      hostPath && cleanPath.startsWith(`${hostPath}/`)
        ? cleanPath.slice(hostPath.length + 1)
        : cleanPath
    const base = host.replace(/\/$/, '')
    const url = `${base}/${relative}`
    return queryString ? `${url}?${queryString}` : url
  }

  private collectContextValues(flags: {
    dataset?: string
    project?: string
  }): Record<string, string> {
    const values: Record<string, string> = {}
    const project = flags.project ?? process.env.SANITY_PROJECT_ID
    const dataset = flags.dataset ?? process.env.SANITY_DATASET
    if (project) values.projectId = project
    if (dataset) values.dataset = dataset
    return values
  }

  private async confirmDestructive(method: string, url: string, yes: boolean): Promise<void> {
    if (yes) return

    if (this.isUnattended()) {
      this.error(
        `Refusing to execute a destructive operation (${method}) in unattended mode.\n` +
          'Hint: pass --yes to confirm (e.g. `sanity api -X DELETE … --yes`).',
        {exit: 1},
      )
    }

    const confirmed = await confirm({
      default: false,
      message: `This will ${method} ${url}. Continue?`,
    })
    if (!confirmed) {
      this.log('Aborted.')
      this.exit(0)
    }
  }

  /* -------------------------------------------------------------------- *
   *  URL assembly                                                         *
   * -------------------------------------------------------------------- */

  private async loadIndex(): Promise<OperationIndexEntry[]> {
    try {
      return await loadOperationsIndex()
    } catch (error) {
      debug('failed to load operations index', error)
      this.error('The OpenAPI service is currently unavailable. Try again later.', {exit: 1})
    }
  }

  /* -------------------------------------------------------------------- *
   *  Destructive guard                                                    *
   * -------------------------------------------------------------------- */

  private renderResponse(
    response: {body: string; contentType: string; status: number},
    raw: boolean,
  ): void {
    if (response.status === 401) {
      this.error(
        'Authentication failed (401). Run `sanity login` or pass `--token=<value>` to override.',
        {exit: 1},
      )
    }
    if (response.status >= 400) {
      this.error(`Request failed with status ${response.status}.\n${response.body}`, {exit: 1})
    }

    if (raw) {
      this.log(response.body)
      return
    }

    // Pretty-print JSON when the server says it's JSON. Non-JSON
    // content (SSE, text, binary) passes through unchanged whether
    // `--json` is set or not.
    if (response.contentType.includes('application/json')) {
      try {
        this.log(JSON.stringify(JSON.parse(response.body), null, 2))
        return
      } catch {
        // Fall through to raw.
      }
    }
    this.log(response.body)
  }

  /* -------------------------------------------------------------------- *
   *  Auth / send / render                                                 *
   * -------------------------------------------------------------------- */

  private resolveMatch(
    rawEndpoint: string,
    method: string,
    index: OperationIndexEntry[],
  ): {inlineQuery: string; operation: OperationIndexEntry; path: string} {
    const result = resolveEndpoint(rawEndpoint, method, index)
    if (result.ok) return result.resolved

    if (result.kind === 'method-not-allowed') {
      this.error(
        `Method ${result.userMethod} not allowed on "${result.userPath}". ` +
          `Available: ${result.available.join(', ')}.`,
        {exit: 1},
      )
    }
    // no-path-match
    this.error(
      `No spec found owning path "${result.userPath}".\n` +
        'Hint: run `sanity api list` to see valid endpoints.',
      {exit: 1},
    )
  }

  private async resolveToken(override: string | undefined): Promise<string | null> {
    if (override) return override
    const stored = await getCliToken()
    return stored ?? null
  }

  private async sendRequest(request: {method: string; token: string | null; url: string}) {
    try {
      return await sendApiRequest(request)
    } catch (error) {
      debug('outbound request failed', error)
      this.error(`Request failed: ${(error as Error).message ?? String(error)}`, {exit: 1})
    }
  }
}
