import {readFile} from 'node:fs/promises'

import {type SchemaType} from 'groq-js'

export interface LoadedSchema {
  bytes?: Buffer
  note?: string
  schema?: SchemaType
}

/**
 * Reads the JSON written by `sanity schema extract`.
 * A missing or unreadable file still lets imports resolve; the note is surfaced as a diagnostic.
 */
export async function loadSchemaFile(schemaPath: string): Promise<LoadedSchema> {
  let bytes: Buffer
  try {
    bytes = await readFile(schemaPath)
  } catch {
    return {
      note: `No schema file at ${schemaPath}. Run "sanity schema extract" and set options.schema to that file.`,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON'
    return {bytes, note: `Could not parse schema JSON at ${schemaPath}: ${message}`}
  }

  if (!Array.isArray(parsed)) {
    return {
      bytes,
      note: `Schema at ${schemaPath} must be the array written by "sanity schema extract".`,
    }
  }

  return {bytes, schema: parsed as SchemaType}
}
