/**
 * The user provided invalid input to `sanity api` (bad field syntax, missing
 * placeholder values, unsupported host, ...). Mapped to exit code 2 by the
 * command, per the CLI exit code convention.
 */
export class ApiUsageError extends Error {}

/**
 * The request targets the project API host (or the path contains a
 * `{projectId}` placeholder) but no project ID has been resolved yet. The
 * command catches this to trigger project resolution (flag, CLI config or
 * interactive prompt) and retries.
 */
export class ProjectIdRequiredError extends Error {
  constructor() {
    super('A project ID is required for this request')
  }
}
