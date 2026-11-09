/**
 * Context Command Generator
 *
 * Distills the Context API's OpenAPI spec, as vendored by the installed
 * `@sanity/client`, into `src/generated/contextOperations.ts`, and writes one
 * command file per entry of `src/actions/context/commandTable.ts`. Bumping
 * `@sanity/client` and running this script is how the context commands follow
 * the API.
 *
 * Regenerate:        pnpm generate:context-commands
 * Verify freshness:  the `contextOperations` unit test fails when the output is stale
 */

/* eslint-disable no-console */
import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join, relative, sep} from 'node:path'

import {contextCommandTable} from '../src/actions/context/commandTable.ts'
import {
  commandClassName,
  commandFilePath,
  readContextSpec,
} from '../src/actions/context/contextSpec.ts'
import {distillContextOperations} from '../src/actions/context/distillContextOperations.ts'

const ROOT = join(import.meta.dirname, '..')

function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", String.raw`\'`)}'`
}

/** A JSON string literal's body as a single-quoted TypeScript string, escapes kept */
function singleQuoted(jsonBody: string): string {
  const body = jsonBody.replaceAll(/\\(.)|'/g, (match, escaped?: string) => {
    if (escaped === undefined) return String.raw`\'`
    return escaped === '"' ? '"' : match
  })
  return `'${body}'`
}

/** Object keys sorted, as the repo's lint rules sort them; arrays keep their order */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortKeys(item))
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortKeys(item)]),
  )
}

/** JSON in the repo's code style: unquoted keys, single-quoted strings */
function serialize(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2).replaceAll(
    /"((?:[^"\\]|\\.)*)"(:?)/g,
    (_, body: string, colon: string) =>
      colon && /^[A-Za-z_$][\w$]*$/.test(body) ? `${body}:` : `${singleQuoted(body)}${colon}`,
  )
}

const operations = distillContextOperations(
  readContextSpec(),
  contextCommandTable.map((entry) => entry.operationId),
)

writeFileSync(
  join(ROOT, 'src/generated/contextOperations.ts'),
  `/**
 * GENERATED FILE - DO NOT EDIT
 *
 * The Context API operations the context commands call, distilled from the
 * OpenAPI spec \`@sanity/client\` vendors.
 *
 * Regenerate with: pnpm generate:context-commands
 */
import {type ContextOperation} from '../actions/context/operationTypes.js'

export const contextOperations = ${serialize(operations)} as const satisfies Record<string, ContextOperation>
`,
)

for (const entry of contextCommandTable) {
  if ('handWritten' in entry) continue
  const file = join(ROOT, commandFilePath(entry.id))
  // Import specifiers take `/` on every platform, and `relative` uses `\\` on Windows
  const factory = relative(dirname(file), join(ROOT, 'src/actions/context/contextCommand.js'))
    .split(sep)
    .join('/')
  mkdirSync(dirname(file), {recursive: true})
  writeFileSync(
    file,
    `// GENERATED FILE - DO NOT EDIT. Regenerate with: pnpm generate:context-commands
import {contextCommand} from '${factory.startsWith('.') ? factory : `./${factory}`}'

export const ${commandClassName(entry.operationId)} = contextCommand(${quote(entry.id)})
`,
  )
}

console.log(`Wrote ${Object.keys(operations).length} operations and their commands`)
