import {z} from 'zod/mini'

import {interfaceFields} from './defineApp.js'

/** The app's interface fields plus the cross-interface rules. Other fields are ignored. */
const WorkbenchAppInterfacesSchema = z
  .object(interfaceFields)
  .check(
    z.refine(
      (app) => !(app.entry !== undefined && (app.views?.length ?? 0) > 0),
      'An app cannot expose both an app view (`entry`) and panel views. Declare one or the other.',
    ),
  )
  .check(
    z.refine((app) => (app.views?.length ?? 0) <= 1, 'An app can expose at most one panel view.'),
  )

/**
 * Validate a branded workbench app before build, dev, or deploy. The branded app
 * bypasses the config-load schema, so this is the one place its declarations are
 * enforced — keep future app-level rules here, not spread across callers. Throws
 * on the first violation.
 * @internal
 */
export function validateWorkbenchApp(app: {
  entry?: unknown
  services?: unknown
  views?: unknown
}): void {
  const result = WorkbenchAppInterfacesSchema.safeParse(app)
  if (result.success) return

  const [issue] = result.error.issues
  const location = issue?.path.length ? `${issue.path.join('.')}: ` : ''
  throw new Error(`${location}${issue?.message ?? 'invalid workbench app'}`)
}
