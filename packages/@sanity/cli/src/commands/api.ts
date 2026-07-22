import {readFileSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {buffer} from 'node:stream/consumers'
import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {colorizeJson, exitCodes, SanityCommand, subdebug} from '@sanity/cli-core'

import {ApiUsageError, ProjectIdRequiredError} from '../actions/api/errors.js'
import {fieldsToQuery, type FieldValue, parseFields} from '../actions/api/parseFields.js'
import {type ResolvedEndpoint, resolveEndpoint} from '../actions/api/resolveEndpoint.js'
import {apiRoutes} from '../generated/apiRoutes.js'
import {promptForProject} from '../prompts/promptForProject.js'
import {type ApiResponse, performApiRequest} from '../services/api.js'
import {getDatasetFlag, getProjectIdFlag} from '../util/sharedFlags.js'

const apiDebug = subdebug('api')

const METHOD_RE = /^[a-z]+$/i

const BODYLESS_METHODS = new Set(['GET', 'HEAD'])

export class ApiCommand extends SanityCommand<typeof ApiCommand> {
  static override args = {
    endpoint: Args.string({
      description:
        'API path (eg "projects" or "data/query/{dataset}"), optionally with placeholders, or a full https://*.api.sanity.io URL',
      required: true,
    }),
  }

  static override description = `Make an authenticated HTTP request to a Sanity API

The endpoint argument is an API path as documented in the published OpenAPI
specifications - list them with "sanity openapi list" and inspect one with
"sanity openapi get <slug>". Paths can be copied verbatim from the specs:
{projectId} and {dataset} placeholders are filled in from flags or the CLI
configuration, and the API host (api.sanity.io or <projectId>.api.sanity.io)
is chosen based on the specs' routing information.

The default request method is GET, or POST when fields or --input are
provided. For GET/HEAD requests, fields are sent as query parameters;
otherwise they are combined into a JSON request body sent with
"Content-Type: application/json". Raw --input bodies are sent without a
default Content-Type - provide one with -H when the API requires it. The
response body is written to stdout.

Requests are authenticated with the token from "sanity login". To use a
specific token instead - for example in CI or when the CLI is not logged in
- pass --token or set the SANITY_AUTH_TOKEN environment variable. Pass
--anonymous to send no token at all.`

  static override examples = [
    {
      command: '<%= config.bin %> <%= command.id %> users/me',
      description: 'Get the current user',
    },
    {
      command: '<%= config.bin %> <%= command.id %> projects/{projectId}',
      description: 'Get the current project (placeholder filled from CLI config)',
    },
    {
      command: `<%= config.bin %> <%= command.id %> 'data/query/{dataset}' -f query='*[_type == "movie"][0..2]'`,
      description: 'Run a GROQ query against the project host',
    },
    {
      command:
        '<%= config.bin %> <%= command.id %> projects/{projectId} -X PATCH -F displayName="My project"',
      description: 'Send a JSON body built from typed fields',
    },
    {
      command: `echo '{"mutations": []}' | <%= config.bin %> <%= command.id %> 'data/mutate/{dataset}' --input - -H 'Content-Type: application/json'`,
      description: 'Send a raw request body from stdin',
    },
    {
      command: '<%= config.bin %> <%= command.id %> jobs/123 --include --api-version v2025-02-19',
      description: 'Include the response status and headers, pinning the API version',
    },
    {
      command: 'SANITY_AUTH_TOKEN=<token> <%= config.bin %> <%= command.id %> users/me',
      description: 'Authenticate with a specific token instead of the logged-in session',
    },
  ]

  static override flags = {
    ...getProjectIdFlag({
      description: 'Project ID for {projectId} placeholders and project-hosted APIs',
      semantics: 'override',
    }),
    ...getDatasetFlag({
      description: 'Dataset for {dataset} placeholders',
      semantics: 'override',
    }),
    anonymous: Flags.boolean({
      default: false,
      description: 'Send the request without an authorization token',
    }),
    'api-version': Flags.string({
      description:
        'API version to use (eg v2025-02-19). Defaults to a version embedded in the endpoint path, or the version from the matching OpenAPI spec',
      helpValue: '<version>',
    }),
    field: Flags.string({
      char: 'F',
      description:
        'Add a typed parameter (key=value): true/false/null and numbers are converted, @file reads the value from a file, @- from stdin',
      helpValue: '<key=value>',
      multiple: true,
    }),
    global: Flags.boolean({
      description: 'Force the request to the global API host (api.sanity.io)',
      exclusive: ['project-hosted'],
    }),
    header: Flags.string({
      char: 'H',
      description: 'Add an HTTP request header (key: value)',
      helpValue: '<key:value>',
      multiple: true,
    }),
    include: Flags.boolean({
      char: 'i',
      default: false,
      description: 'Include the HTTP response status and headers in the output',
    }),
    input: Flags.string({
      description:
        'Read the raw request body from a file (use "-" for stdin). Sent without a default Content-Type - provide one with -H when the API requires it',
      exclusive: ['field', 'raw-field'],
      helpValue: '<file>',
    }),
    method: Flags.string({
      char: 'X',
      description: 'HTTP method to use (default GET, or POST when fields or --input are provided)',
      helpValue: '<method>',
    }),
    pretty: Flags.boolean({
      default: false,
      description: 'Colorize JSON output',
    }),
    'project-hosted': Flags.boolean({
      description: 'Force the request to the project API host (<projectId>.api.sanity.io)',
      exclusive: ['global'],
    }),
    'raw-field': Flags.string({
      char: 'f',
      description: 'Add a string parameter (key=value)',
      helpValue: '<key=value>',
      multiple: true,
    }),
    token: Flags.string({
      char: 't',
      description: 'API token to authenticate with, instead of the logged-in user token',
      exclusive: ['anonymous'],
      helpValue: '<token>',
    }),
  }

  /**
   * Read the raw body for `--input`, or the content referenced by a `@-`
   * field value. Returns raw bytes so binary bodies survive unmodified.
   * Extracted so tests can substitute stdin.
   */
  protected readStdin(): Promise<Buffer> {
    return buffer(process.stdin)
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(ApiCommand)

    try {
      await this.performRequest(args.endpoint, flags)
    } catch (error) {
      if (error instanceof ApiUsageError) {
        this.error(error.message, {exit: exitCodes.USAGE_ERROR})
      }
      throw error
    }
  }

  private async performRequest(
    endpoint: string,
    flags: (typeof ApiCommand.prototype)['flags'],
  ): Promise<void> {
    const stdin = await this.resolveStdin(flags)

    const fields = parseFields({
      fields: flags.field,
      rawFields: flags['raw-field'],
      readFile: (path) => readFileSync(path, 'utf8'),
      stdin: stdin?.toString('utf8'),
    })
    const hasFields = Object.keys(fields).length > 0

    const method = this.resolveMethod(flags.method, hasFields || flags.input !== undefined)
    const useQueryFields = BODYLESS_METHODS.has(method)

    const body = await this.resolveBody(flags, fields, hasFields, useQueryFields, stdin)
    const query = useQueryFields && hasFields ? fieldsToQuery(fields) : {}

    const resolved = await this.resolveTarget(endpoint, flags)
    apiDebug('Resolved endpoint', resolved)

    const response = await performApiRequest({
      ...(body === undefined ? {} : {body}),
      headers: parseHeaders(flags.header ?? []),
      method,
      query,
      resolved,
      token: flags.token,
      unauthenticated: flags.anonymous,
    })

    this.printResponse(response, flags)

    if (response.statusCode >= 400) {
      const statusLine = `HTTP ${response.statusCode}${
        response.statusMessage ? ` ${response.statusMessage}` : ''
      }`
      const loginHint =
        response.statusCode === 401 && !flags.anonymous
          ? `. You may need to login again with ${styleText('cyan', 'sanity login')}`
          : ''
      this.error(`${statusLine}${loginHint}`, {exit: exitCodes.RUNTIME_ERROR})
    }
  }

  private printResponse(response: ApiResponse, flags: {include: boolean; pretty: boolean}): void {
    if (flags.include) {
      this.log(
        `HTTP ${response.statusCode}${response.statusMessage ? ` ${response.statusMessage}` : ''}`,
      )
      for (const [key, value] of Object.entries(response.headers)) {
        this.log(`${key}: ${value}`)
      }
      this.log('')
    }

    if (!response.jsonBody) {
      if (response.rawBody !== '') this.log(response.rawBody)
      return
    }

    this.log(flags.pretty ? colorizeJson(response.body) : JSON.stringify(response.body, null, 2))
  }

  private async resolveBody(
    flags: {input?: string},
    fields: Record<string, FieldValue>,
    hasFields: boolean,
    useQueryFields: boolean,
    stdin: Buffer | undefined,
  ): Promise<Buffer | unknown | undefined> {
    if (flags.input !== undefined) {
      if (flags.input === '-') return stdin
      try {
        // Read raw bytes - `--input` bodies may be binary (eg asset uploads)
        return await readFile(flags.input)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new ApiUsageError(`Failed to read --input file "${flags.input}": ${message}`)
      }
    }

    return hasFields && !useQueryFields ? fields : undefined
  }

  private resolveMethod(methodFlag: string | undefined, hasBody: boolean): string {
    if (methodFlag === undefined) {
      return hasBody ? 'POST' : 'GET'
    }
    if (!METHOD_RE.test(methodFlag)) {
      throw new ApiUsageError(`Invalid HTTP method "${methodFlag}"`)
    }
    return methodFlag.toUpperCase()
  }

  private async resolveStdin(flags: {
    field?: string[]
    input?: string
  }): Promise<Buffer | undefined> {
    const needsStdin =
      flags.input === '-' || (flags.field ?? []).some((field) => field.endsWith('=@-'))
    return needsStdin ? this.readStdin() : undefined
  }

  private async resolveTarget(
    endpoint: string,
    flags: {
      'api-version'?: string
      dataset?: string
      global?: boolean
      'project-hosted'?: boolean
      'project-id'?: string
    },
  ): Promise<ResolvedEndpoint> {
    const cliConfig = await this.tryGetCliConfig()

    const baseOptions = {
      apiVersion: flags['api-version'],
      dataset: flags.dataset ?? cliConfig.api?.dataset,
      endpoint,
      forceHost: flags.global ? ('global' as const) : undefined,
      routes: apiRoutes,
    }
    const forceHost = flags['project-hosted'] ? ('project' as const) : baseOptions.forceHost

    try {
      return resolveEndpoint({
        ...baseOptions,
        forceHost,
        projectId: flags['project-id'] ?? cliConfig.api?.projectId,
      })
    } catch (error) {
      if (!(error instanceof ProjectIdRequiredError)) throw error

      // The request needs a project ID that flags/config didn't provide -
      // resolve one interactively (or fail with actionable suggestions).
      const projectId = await this.getProjectId({fallback: () => promptForProject({})})
      return resolveEndpoint({...baseOptions, forceHost, projectId})
    }
  }
}

function parseHeaders(headerFlags: string[]): Record<string, string> {
  // Null-prototype for the same reason as the field containers in parseFields
  const headers: Record<string, string> = Object.create(null)

  for (const header of headerFlags) {
    const separatorIndex = header.indexOf(':')
    if (separatorIndex < 1) {
      throw new ApiUsageError(`Invalid --header "${header}": expected "key: value" format`)
    }
    headers[header.slice(0, separatorIndex).trim()] = header.slice(separatorIndex + 1).trim()
  }

  return headers
}
