import {DefineAppInputSchema} from './defineApp.js'

/**
 * Collect validation errors for a workbench app.
 * @internal
 */
export function validateWorkbenchApp(app: unknown): string[] {
  const result = DefineAppInputSchema.safeParse(app)
  if (result.success) return []

  return result.error.issues.map((issue) => {
    const location = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${location}${issue.message}`
  })
}

/**
 * Render the errors as one message, so callers report them together.
 * @internal
 */
export function formatWorkbenchAppErrors(errors: string[]): string {
  return ['Invalid workbench app config:', ...errors.map((error) => `  - ${error}`)].join('\n')
}
