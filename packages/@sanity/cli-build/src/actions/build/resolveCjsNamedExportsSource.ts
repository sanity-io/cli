import {readFile} from 'node:fs/promises'
import path from 'node:path'

// Matches React's production wrapper:
// `if (process.env.NODE_ENV === 'production') { module.exports = require('./cjs/...'); }`
const PRODUCTION_CJS_REEXPORT =
  /if\s*\(\s*process\.env\.NODE_ENV\s*===\s*['"]production['"]\s*\)\s*\{[^}]*module\.exports\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/

/**
 * Resolves the CommonJS source file whose named exports should be extracted for
 * a vendor entry point.
 *
 * Many packages (e.g. `react`, `react-dom`) ship thin wrappers that re-export a
 * production CJS bundle via `module.exports = require(...)`. The vendor build
 * entry uses those wrappers (per `package.json` `exports`), but named-export
 * extraction must read the underlying CJS module instead.
 */
export async function resolveCjsNamedExportsSource(
  packageDir: string,
  entryPath: string,
): Promise<string> {
  const source = await readFile(entryPath, 'utf8')
  const [, relativeTarget] = PRODUCTION_CJS_REEXPORT.exec(source) ?? []

  if (!relativeTarget) {
    return source
  }

  const targetPath = path.resolve(path.dirname(entryPath), relativeTarget)
  return readFile(targetPath, 'utf8')
}
