import {existsSync, mkdirSync} from 'node:fs'
import {appendFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

/**
 * Path to agent debug log file
 */
export const AGENT_LOG_PATH = join(homedir(), '.sanity', 'agent-debug.log')

/**
 * Ensure the .sanity directory exists
 */
function ensureLogDirectory(): void {
  const sanityDir = join(homedir(), '.sanity')
  if (!existsSync(sanityDir)) {
    mkdirSync(sanityDir, {recursive: true})
  }
}

/**
 * Write a log message to the agent debug log file
 *
 * @param message - Log message to write
 * @param level - Log level (info, error, warn, debug)
 */
export async function logToFile(
  message: string,
  level: 'debug' | 'error' | 'info' | 'warn' = 'info',
): Promise<void> {
  try {
    ensureLogDirectory()

    const msg = typeof message === 'object' ? JSON.stringify(message) : message

    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${msg}\n`

    await appendFile(AGENT_LOG_PATH, logLine, 'utf8')
  } catch (error) {
    // Silently fail - don't break the app if logging fails
    console.error('Failed to write to log file:', error)
  }
}

/**
 * Write an error to the log file with stack trace
 *
 * @param error - Error object to log
 * @param context - Additional context about where the error occurred
 */
export async function logErrorToFile(error: Error, context?: string): Promise<void> {
  const message = context ? `${context}: ${error.message}` : error.message
  const stackTrace = error.stack || 'No stack trace available'

  await logToFile(`${message}\n${stackTrace}`, 'error')
}
