/**
 * Standard exit codes for CLI commands.
 *
 * - 0, 1, 2 align with oclif defaults and Unix convention.
 * - 3 is application-defined (oclif does not use it).
 * - 130 follows the Unix convention of 128 + signal number (SIGINT = 2).
 *
 * @see CLAUDE.md "Exit Code Convention" for usage guidance and examples.
 */
export const exitCodes = {
  /** Something went wrong that is not the user's fault (API errors, network, missing config, etc.). */
  RUNTIME_ERROR: 1,
  /** The user interrupted via Ctrl+C (128 + SIGINT). Handled by SanityCommand.catch(). */
  SIGINT: 130,
  /** Command completed normally. */
  SUCCESS: 0,
  /** The user provided invalid input (bad args, unknown flags, validation failures). */
  USAGE_ERROR: 2,
  /** The user declined a confirmation or chose not to proceed. */
  USER_ABORT: 3,
} as const
