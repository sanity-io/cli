import {Args, Flags} from '@oclif/core'
import {getCliToken, SanityCommand} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

import {buildRequestBody, parseHeaderFlags} from '../../api/body.js'
import {
  collectContextValues,
  formatMalformedQueryError,
  formatMethodNotAllowedError,
  formatNoMatchError,
  formatPreflightError,
} from '../../api/errors.js'
import {loadOperationsIndexOrThrow, type OperationIndexEntry} from '../../api/parser.js'
import {type PreflightIssue, runPreflight} from '../../api/preflight.js'
import {buildRequestUrl, sendApiRequest, streamApiResponse} from '../../api/request.js'
import {resolveEndpoint} from '../../api/resolveEndpoint.js'

const DESTRUCTIVE_METHODS = new Set(['DELETE', 'PATCH', 'PUT'])

/**
 * Default command for the `api` topic — `sanity api <endpoint>`.
 *
 * Routes when the user's first argument doesn't match a known
 * subcommand (`list`, `spec`). Takes the verbatim endpoint string
 * that `sanity api list` rendered, plus standard request flags
 * (`-X`, `-q`, `--token`, `--projectId`, `--organizationId`,
 * `--dataset`, `--json`, `--yes`).
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
      command: '<%= config.bin %> <%= command.id %> v2024-01-01/data/query/:dataset --query "*[0]"',
      description: 'Pass a GROQ filter to /data/query or /data/listen',
    },
    {
      command: '<%= config.bin %> <%= command.id %> v2024-01-01/data/query/:dataset -q tag=my-app',
      description: 'Append an arbitrary query parameter (repeatable, URL-encoded)',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> --projectId=xyz v2024-01-01/projects/:projectId',
      description: 'Auto-fill :projectId / :organizationId / :dataset placeholders from flags',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -X POST v2024-01-01/mutate/:dataset -f mutations=@./patch.json',
      description: 'Build a JSON body from -f / -F fields',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -X POST v2024-01-01/mutate/:dataset --input ./body.json',
      description:
        'Send a request body verbatim from file (or `--input -` for stdin). Deterministic JSON shape — bypasses `-f` value coercion.',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> -X POST v.../endpoint -f count=5 -f name=hello -f \'tag="5"\'',
      description:
        '-f values JSON-parse when valid (numbers/booleans), fall back to string. Force string with embedded quotes (`tag="5"`).',
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
        'Repeatable `key=value` JSON body field. Values JSON-parse when valid (numbers/booleans/objects); ' +
        'fall back to a string otherwise. Force a string by embedding quotes: `-f tag=\'"5"\'`. ' +
        'Dotted keys nest (`profile.name=Bob` → `{profile: {name: "Bob"}}`). ' +
        'For deterministic body shape, prefer `--input <path>`.',
      multiple: true,
    }),
    fieldFile: Flags.string({
      char: 'F',
      description:
        'Repeatable `key=@path` body field — value is the file contents (JSON-parsed when valid, ' +
        'falls back to a string). For deterministic body shape, prefer `--input <path>`.',
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
    organizationId: Flags.string({
      aliases: ['organization'],
      description: 'Fills `:organizationId` placeholders in host or path (alias: `--organization`)',
    }),
    projectId: Flags.string({
      aliases: ['project'],
      description: 'Fills `:projectId` placeholders in host or path (alias: `--project`)',
    }),
    query: Flags.string({
      description:
        'GROQ filter — shorthand for `-q query=<value>`. Required for /data/query and /data/listen endpoints.',
    }),
    queryParam: Flags.string({
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

    const queryParamFlags = flags.queryParam ?? []
    this.validateQueryFlags(queryParamFlags)
    const queryFlags =
      flags.query === undefined ? queryParamFlags : [...queryParamFlags, `query=${flags.query}`]

    const index = await loadOperationsIndexOrThrow()
    const {inlineQuery, operation, path} = this.resolveMatch(args.endpoint, flags.method, index)

    const context = collectContextValues(flags)

    const issues = runPreflight({context, inlineQuery, queryFlags, resolved: {operation, path}})
    if (issues.length > 0) this.reportPreflight(issues[0], operation, context, path)

    const url = buildRequestUrl({context, inlineQuery, operation, path, queryFlags})
    const {body, contentType} = await buildRequestBody({
      fieldPairs: flags.field ?? [],
      filePairs: flags.fieldFile ?? [],
      inputPath: flags.input ?? null,
      method: operation.method,
      schemaHint: buildBodySchemaHint(operation),
    })
    const extraHeaders = parseHeaderFlags(flags.header ?? [])
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
      const {status} = await streamApiResponse(apiRequest, (chunk) => process.stdout.write(chunk))
      if (status >= 400) this.exit(1)
      return
    }

    const response = await sendApiRequest(apiRequest)
    this.renderResponse(response, flags.json ?? false)
  }

  /* -------------------------------------------------------------------- *
   *  Each step is a thin oclif translation around a seam in src/api/.
   *  Resolution, preflight, URL assembly, send, and render all live
   *  outside the command — keeps this file focused on flag parsing,
   *  error copy, and the destructive prompt.
   * -------------------------------------------------------------------- */

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
    //
    // The "modifies server state" hint matters most for PUT, which an
    // agent might assume is benign-by-method (e.g. a PUT-to-accept-invite
    // endpoint). All three methods in DESTRUCTIVE_METHODS mutate, so the
    // same prompt fits PATCH/PUT/DELETE.
    const displayUrl = stripTelemetryTag(url)
    const confirmed = await confirm({
      default: false,
      message: `This will ${method} ${displayUrl} (modifies server state). Continue?`,
    })
    if (!confirmed) this.error('Aborted.', {exit: 1})
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
  private reportPreflight(
    issue: PreflightIssue,
    operation: OperationIndexEntry,
    context: Record<string, string>,
    path: string,
  ): never {
    this.error(formatPreflightError(issue, operation, context, path), {exit: 1})
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
        formatMethodNotAllowedError(result.userMethod, result.userPath, result.available),
        {exit: 1},
      )
    }
    this.error(formatNoMatchError(result.userPath, index), {exit: 1})
  }

  private async resolveToken(override: string | undefined): Promise<string | null> {
    if (override) return override
    const stored = await getCliToken()
    return stored ?? null
  }

  /**
   * Reject `-q foo` (no `=`) up front — silently dropping malformed
   * values would send the request without the param the user thought
   * they'd set, which is a much more confusing failure than a 4xx.
   */
  private validateQueryFlags(queryFlags: readonly string[]): void {
    for (const pair of queryFlags) {
      if (!pair.includes('=')) this.error(formatMalformedQueryError(pair), {exit: 1})
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

/**
 * Placeholders the CLI fills from flags / env / `sanity.cli.ts`. Flag
 * names mirror the URL placeholder verbatim (e.g. `:projectId` →
 * `--projectId`) so users don't have to translate. Adding a new
 * supported placeholder is a single-row change.
 */
// Placeholder/context plumbing + all error-message construction live in
// `./errors.ts`. Keep the command file focused on flag parsing, the
// orchestration pipeline, and the destructive prompt.

/**
 * Build the schema hint surfaced when the operation requires a body
 * but the user gave none. Names the required top-level fields and
 * points at `sanity api spec --operation=<id>` for the full schema —
 * so the next attempt has everything it needs without an exploratory
 * round-trip.
 */
function buildBodySchemaHint(operation: OperationIndexEntry): {
  docsCommand?: string
  requiredFields?: string[]
} {
  const required = operation.requestBody?.fields.filter((f) => f.required).map((f) => f.name) ?? []
  return {
    docsCommand: `sanity api spec ${operation.spec} --operation=${operation.operationId} --format=json`,
    requiredFields: required,
  }
}
