import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Detects if a file uses the legacy <SanityApp> pattern
 * by checking for both the import and JSX usage
 *
 * @param filePath - Path to the file to check (typically App.tsx/App.jsx)
 * @param cwd - Current working directory
 * @returns Object with detection results and warning message
 * @internal
 */
export async function detectLegacySanityApp(
  filePath: string,
  cwd: string,
): Promise<{
  hasLegacyPattern: boolean
  warningMessage?: string
}> {
  try {
    // Try common extensions if the exact file doesn't exist
    const extensions = ['.tsx', '.ts', '.jsx', '.js']
    let fileContent: string | null = null
    let resolvedPath = filePath

    // If filePath doesn't have an extension, try common ones
    if (path.extname(filePath)) {
      const fullPath = path.resolve(cwd, filePath)
      fileContent = await fs.readFile(fullPath, 'utf8')
    } else {
      for (const ext of extensions) {
        const testPath = path.resolve(cwd, `${filePath}${ext}`)
        try {
          fileContent = await fs.readFile(testPath, 'utf8')
          resolvedPath = testPath
          break
        } catch {
          // Try next extension
        }
      }
    }

    if (!fileContent) {
      // File not found, can't detect - assume no legacy pattern
      return {hasLegacyPattern: false}
    }

    // Check for SanityApp import from @sanity/sdk-react
    const hasSanityAppImport =
      /import\s+{[^}]*\bSanityApp\b[^}]*}\s+from\s+['"]@sanity\/sdk-react['"]/.test(fileContent) ||
      /import\s+{[^}]*\bSanityApp\b[^}]*}\s+from\s+["']@sanity\/sdk-react["']/.test(fileContent)

    // Check for <SanityApp usage in JSX
    const hasSanityAppUsage = /<SanityApp\b/.test(fileContent)

    const hasLegacyPattern = hasSanityAppImport && hasSanityAppUsage

    if (hasLegacyPattern) {
      return {
        hasLegacyPattern: true,
        warningMessage: createWarningMessage(path.relative(cwd, resolvedPath)),
      }
    }

    return {hasLegacyPattern: false}
  } catch {
    // If we can't read the file, assume no legacy pattern
    return {hasLegacyPattern: false}
  }
}

function createWarningMessage(relativePath: string): string {
  return `
⚠️  DEPRECATION WARNING: Legacy SanityApp pattern detected

Your app component (${relativePath}) is using the legacy <SanityApp> pattern.
The CLI now automatically wraps your app with SanityApp context, so you no longer
need to include it in your component.

This will continue to work for now, but nested SanityApp components may cause
unexpected behavior with configuration and context.

To migrate:
1. Remove the SanityApp import from your component
2. Remove the <SanityApp> wrapper from your JSX
3. Configure resources in your sanity.cli.ts instead

Example migration:

  BEFORE:
    import {SanityApp} from '@sanity/sdk-react'

    function App() {
      const config = [{projectId: 'xxx', dataset: 'yyy'}]
      return (
        <SanityApp config={config}>
          <YourContent />
        </SanityApp>
      )
    }

  AFTER:
    // No SanityApp import needed!

    function App() {
      return <YourContent />
    }

    // Configure in sanity.cli.ts:
    export default {
      app: {
        resources: {
          default: {projectId: 'xxx', dataset: 'yyy'}
        }
      }
    }
`.trim()
}
