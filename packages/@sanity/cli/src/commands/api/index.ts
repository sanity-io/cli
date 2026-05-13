import {Args, Flags} from '@oclif/core'
import {getCliToken, SanityCommand, subdebug} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

import {buildRequestBody, parseHeaderFlags} from '../../api/body.js'
import {loadOperationsIndex, type OperationIndexEntry} from '../../api/parser.js'
import {type PreflightIssue, runPreflight} from '../../api/preflight.js'
import {buildRequestUrl, sendApiRequest, streamApiResponse} from '../../api/request.js'
import {resolveEndpoint} from '../../api/resolveEndpoint.js'

const debug = subdebug('api:call')

const DESTRUCTIVE_METHODS = new Set(['DELETE', 'PATCH', 'PUT'])

/**
 * Default command for the `api` topic — `sanity api <endpoint>`.
 *
 * Routes when the user's first argument doesn't match a known
 * subcommand (`list`, `spec`). Takes the verbatim endpoint string
 * that `sanity api list` rendered, plus standard request flags
 * (`-X`, `-q`, `--token`, `--project`, `--dataset`, `--json`, `--yes`).
 *
 * The command itself is the orchestration shell: load index → resolve
 * match → run preflight → destructive guard → build URL → send →
 * render. Each step lives behind its own seam in `src/api/`.
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
      command:
        '<%= config.bin %> <%= command.id %> -X POST v2024-01-01/mutate/:dataset -f mutations=@./patch.json',
      description: 'Build a JSON body from -f / -F fields',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -X POST v2024-01-01/mutate/:dataset --input ./body.json',
      description: 'Send a request body verbatim from file (or `--input -` for stdin)',
    },
    {
      command: '<%= config.bin %> <%= command.id %> -X DELETE v2024-01-01/projects/abc --yes',
      description: 'Destructive ops (PATCH/PUT/DELETE) need --yes in unattended contexts',
    },
  ]

  static override flags = {
    dataset: Flags.string({description: 'Fills `:dataset` placeholders in host or path'}),
    'dry-run': Flags.boolean({
      description:
        'Print method + URL + headers + body that would be sent, then exit. Skips network and destructive guard.',
    }),
    field: Flags.string({
      char: 'f',
      description:
        'Repeatable `key=value` JSON body field (value JSON-parsed when possible; dotted keys nest)',
      multiple: true,
    }),
    fieldFile: Flags.string({
      char: 'F',
      description:
        'Repeatable `key=@path` body field — value is the file contents (JSON-parsed when possible)',
      multiple: true,
    }),
    header: Flags.string({
      char: 'H',
      description: 'Repeatable `Name: Value` header. Overrides CLI defaults on collision.',
      multiple: true,
    }),
    input: Flags.string({
      description:
        'Read request body from file path (or `-` for stdin). Mutually exclusive with -f/-F.',
    }),
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
    stream: Flags.boolean({
      description:
        'Stream the response body chunk-by-chunk to stdout (useful for SSE / long-running endpoints)',
    }),
    token: Flags.string({description: 'Override the stored auth token for this call'}),
    yes: Flags.boolean({
      char: 'y',
      description: 'Confirm destructive operations without prompting',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ApiCallCommand)

    const queryFlags = flags.query ?? []
    this.validateQueryFlags(queryFlags)

    const index = await this.loadIndex()
    const {inlineQuery, operation, path} = this.resolveMatch(args.endpoint, flags.method, index)

    const context = collectContextValues(flags)

    const issues = runPreflight({context, inlineQuery, queryFlags, resolved: {operation, path}})
    if (issues.length > 0) this.reportPreflight(issues[0], operation)

    const url = buildRequestUrl({context, inlineQuery, operation, path, queryFlags})
    const {body, contentType} = await this.buildBody(operation.method, flags)
    const extraHeaders = this.parseHeaders(flags.header ?? [])
    const token = await this.resolveToken(flags.token)

    // `--dry-run` prints the assembled request and exits before any
    // side effects — that's the whole point, so it precedes both the
    // destructive guard and the network send.
    if (flags['dry-run']) {
      this.renderDryRun({body, contentType, extraHeaders, method: operation.method, token, url})
      return
    }

    if (DESTRUCTIVE_METHODS.has(operation.method)) {
      await this.confirmDestructive(operation.method, url)
    }

    const apiRequest = {
      body,
      contentType,
      extraHeaders,
      method: operation.method,
      token,
      url,
    }

    if (flags.stream) {
      await this.streamRequest(apiRequest)
      return
    }

    const response = await this.sendRequest(apiRequest)
    this.renderResponse(response, flags.json ?? false)
  }

  /* -------------------------------------------------------------------- *
   *  Each step is a thin oclif translation around a seam in src/api/.
   *  Resolution, preflight, URL assembly, send, and render all live
   *  outside the command — keeps this file focused on flag parsing,
   *  error copy, and the destructive prompt.
   * -------------------------------------------------------------------- */

  /**
   * Translate `-f` / `-F` / `--input` flags into a request body.
   * Errors from `buildRequestBody` already carry user-facing copy —
   * just forward them through `this.error()`.
   */
  private async buildBody(
    method: string,
    flags: {field?: string[]; fieldFile?: string[]; input?: string},
  ): Promise<{body: string | null; contentType: string | null}> {
    try {
      return await buildRequestBody({
        fieldPairs: flags.field ?? [],
        filePairs: flags.fieldFile ?? [],
        inputPath: flags.input ?? null,
        method,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(message, {exit: 1})
    }
  }

  /**
   * Destructive-op guard. `isUnattended()` is the single source of truth
   * (it folds in `--yes` and TTY detection); we either refuse outright
   * or prompt — never both. Aborting via the prompt exits non-zero so a
   * wrapping script doesn't continue as if the call succeeded.
   */
  private async confirmDestructive(method: string, url: string): Promise<void> {
    if (this.isUnattended()) {
      // `--yes` already short-circuits via isUnattended()'s false branch.
      if (this.flags.yes) return
      this.error(
        `Refusing to execute a destructive operation (${method}) in unattended mode.\n` +
          'Hint: pass --yes to confirm (e.g. `sanity api -X DELETE … --yes`).',
        {exit: 1},
      )
    }

    // Hide the telemetry tag from the prompt — it's CLI implementation
    // noise the user shouldn't have to mentally subtract.
    const displayUrl = stripTelemetryTag(url)
    const confirmed = await confirm({
      default: false,
      message: `This will ${method} ${displayUrl}. Continue?`,
    })
    if (!confirmed) this.error('Aborted.', {exit: 1})
  }

  private async loadIndex(): Promise<OperationIndexEntry[]> {
    try {
      return await loadOperationsIndex()
    } catch (error) {
      debug('failed to load operations index', error)
      this.error('The OpenAPI service is currently unavailable. Try again later.', {exit: 1})
    }
  }

  private parseHeaders(headerFlags: readonly string[]): Record<string, string> {
    try {
      return parseHeaderFlags(headerFlags)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(message, {exit: 1})
    }
  }

  /**
   * Print the assembled request without sending it. Mimics the
   * "curl -v" request-lines + body shape so the output is easy to
   * copy into a manual call.
   *
   * The token is masked because dry-run output is the most likely
   * candidate for "paste into a bug report" — we'd rather not have
   * users leak their bearer token by accident.
   */
  private renderDryRun(request: {
    body: string | null
    contentType: string | null
    extraHeaders: Record<string, string>
    method: string
    token: string | null
    url: string
  }): void {
    const lines: string[] = [`${request.method} ${request.url}`]

    if (request.token) {
      lines.push(`authorization: Bearer ${maskToken(request.token)}`)
    }
    if (request.body !== null && request.contentType) {
      lines.push(`content-type: ${request.contentType}`)
    }
    for (const [name, value] of Object.entries(request.extraHeaders)) {
      lines.push(`${name}: ${value}`)
    }

    if (request.body !== null) {
      lines.push('', request.body)
    }

    this.log(lines.join('\n'))
  }

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

  /**
   * Translate a single preflight issue into a friendly error + exit.
   * The `switch` is exhaustive on `kind`; adding a new `PreflightIssue`
   * variant trips a `never`-type error here instead of silently falling
   * through to an unrelated message.
   */
  private reportPreflight(issue: PreflightIssue, operation: OperationIndexEntry): never {
    switch (issue.kind) {
      case 'missing-required-query': {
        this.error(
          `Missing required query parameter(s): ${issue.names.join(', ')}\n` +
            `Hint: pass with -q name=value. See: sanity api spec ${operation.spec} ` +
            `--operation=${operation.operationId} --format=json`,
          {exit: 1},
        )
        break
      }
      case 'unfilled-placeholder': {
        this.error(formatUnfilledPlaceholders(issue.names, operation), {exit: 1})
        break
      }
      default: {
        const _exhaustive: never = issue
        throw new Error(`Unhandled preflight issue: ${JSON.stringify(_exhaustive)}`)
      }
    }
    // `this.error()` is `never`; the explicit throw keeps the TS narrowing
    // honest in case someone replaces it with a non-fatal logger.
    throw new Error('unreachable')
  }

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

  private async sendRequest(request: {
    body: string | null
    contentType: string | null
    extraHeaders: Record<string, string>
    method: string
    token: string | null
    url: string
  }) {
    try {
      return await sendApiRequest(request)
    } catch (error) {
      debug('outbound request failed', error)
      this.error(`Request failed: ${(error as Error).message ?? String(error)}`, {exit: 1})
    }
  }

  /**
   * Stream the response body to stdout chunk-by-chunk. Used for SSE
   * endpoints (`isStreaming: true` in `sanity api list`) and any
   * long-running text response where buffering the whole body would
   * defeat the point.
   *
   * On non-2xx we still emit the chunks (the server's error payload
   * is often the most useful signal) and exit non-zero afterwards.
   */
  private async streamRequest(request: {
    body: string | null
    contentType: string | null
    extraHeaders: Record<string, string>
    method: string
    token: string | null
    url: string
  }): Promise<void> {
    let status: number
    try {
      const result = await streamApiResponse(request, (chunk) => process.stdout.write(chunk))
      status = result.status
    } catch (error) {
      debug('outbound stream failed', error)
      this.error(`Request failed: ${(error as Error).message ?? String(error)}`, {exit: 1})
    }
    if (status >= 400) this.exit(1)
  }

  /**
   * Reject `-q foo` (no `=`) up front — silently dropping malformed
   * values would send the request without the param the user thought
   * they'd set, which is a much more confusing failure than a 4xx.
   */
  private validateQueryFlags(queryFlags: readonly string[]): void {
    for (const pair of queryFlags) {
      if (!pair.includes('=')) {
        this.error(
          `-q values must be in key=value form (got "${pair}").\n` +
            'Hint: pass empty values as `-q key=`.',
          {exit: 1},
        )
      }
    }
  }
}

/* ---------------------------------------------------------------------- *
 *  Pure helpers (no command coupling)                                     *
 * ---------------------------------------------------------------------- */

/**
 * Mask a bearer token for dry-run display. Keeps the first 4 + last 4
 * characters so the user can identify which token they're sending
 * without the value being readable from a screenshot or pasted log.
 */
function maskToken(token: string): string {
  if (token.length <= 8) return '***'
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}

/**
 * Drop the `tag=sanity.cli.api` telemetry parameter for display
 * purposes. The tag is merged into every outbound URL, but it's
 * implementation noise the user shouldn't have to mentally subtract
 * when reading a confirmation prompt. Only strips when the value
 * matches the CLI's telemetry sentinel — user-supplied `tag=…`
 * values pass through untouched.
 */
function stripTelemetryTag(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.get('tag') === 'sanity.cli.api') {
      parsed.searchParams.delete('tag')
    }
    const query = parsed.searchParams.toString()
    return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`
  } catch {
    return url
  }
}

function collectContextValues(flags: {dataset?: string; project?: string}): Record<string, string> {
  const values: Record<string, string> = {}
  const project = flags.project ?? process.env.SANITY_PROJECT_ID
  const dataset = flags.dataset ?? process.env.SANITY_DATASET
  if (project) values.projectId = project
  if (dataset) values.dataset = dataset
  return values
}

function formatUnfilledPlaceholders(names: string[], operation: OperationIndexEntry): string {
  const contextNames = names.filter((name) =>
    ['dataset', 'organizationId', 'projectId'].includes(name),
  )
  const nonContext = names.filter((name) => !contextNames.includes(name))

  const lines = [`Unfilled path placeholder(s): ${names.map((n) => `:${n}`).join(', ')}`]
  if (contextNames.length > 0) {
    const hint = contextNames[0]
    const flag = hint === 'projectId' ? 'project' : hint
    const env = `SANITY_${hint === 'projectId' ? 'PROJECT_ID' : hint.toUpperCase()}`
    lines.push(
      `Hint: pass --${flag}=<value>, set ${env}, ` +
        'or run from a directory with `sanity.cli.ts`.',
    )
  }
  if (nonContext.length > 0) {
    lines.push(
      'Hint: substitute the value directly in the endpoint string ' +
        `(e.g. ${operation.endpoint.replaceAll(/:(\w+)/g, '<$1>')}).`,
    )
  }
  return lines.join('\n')
}
