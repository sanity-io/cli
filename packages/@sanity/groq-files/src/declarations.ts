import {readdir, readFile, writeFile} from 'node:fs/promises'
import {relative, resolve} from 'node:path'

import {TypeGenerator} from '@sanity/codegen'

import {evaluateGroqModule} from './evaluateGroqModule.js'
import {loadSchemaFile} from './schemaFile.js'

const SKIP_DIRECTORIES = new Set(['.git', '.tmp', '.turbo', 'coverage', 'dist', 'node_modules'])

export interface GenerateGroqDeclarationsOptions {
  /** Directory to scan for `.groq` files. */
  directory: string

  /** The file written by `sanity schema extract`, relative to `directory`. Defaults to `schema.json`. */
  schemaPath?: string
}

/**
 * Writes `<name>.d.groq.ts` next to every `.groq` file under `directory`.
 *
 * That is the name TypeScript 5 and 6 look for when `allowArbitraryExtensions` is on:
 * `import x from './posts.groq'` resolves to `posts.d.groq.ts`.
 * https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#allowarbitraryextensions
 */
export async function generateGroqDeclarations(
  options: GenerateGroqDeclarationsOptions,
): Promise<string[]> {
  const directory = resolve(options.directory)
  const schemaPath = resolve(directory, options.schemaPath ?? 'schema.json')
  const loaded = await loadSchemaFile(schemaPath)
  const generator = new TypeGenerator()
  const files = await collectGroqFiles(directory)
  const written: string[] = []

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    const evaluated = await evaluateGroqModule({
      content,
      filename: relative(directory, file),
      generator,
      root: directory,
      schema: loaded.schema,
      schemaNote: loaded.note,
      schemaPath,
    })
    const output = declarationPath(file)
    await writeFile(output, evaluated.text)
    written.push(output)
  }

  return written
}

export function declarationPath(groqFile: string): string {
  return groqFile.replace(/\.groq$/, '.d.groq.ts')
}

async function collectGroqFiles(directory: string): Promise<string[]> {
  const found: string[] = []
  await walk(directory, found)
  found.sort((left, right) => left.localeCompare(right))
  return found
}

async function walk(directory: string, found: string[]): Promise<void> {
  const entries = await readdir(directory, {withFileTypes: true})
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await walk(path, found)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.groq')) found.push(path)
  }
}
