import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {readFile, stat} from 'node:fs/promises'
import {basename, dirname, resolve} from 'node:path'

import {z} from 'zod'

const entrySchema = z.object({
  contentType: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  key: z.string().min(1),
  source: z.string().min(1),
  type: z.enum(['image', 'file']).default('image'),
})

export interface ManifestEntry {
  key: string
  value: unknown
}

export class BatchInputError extends Error {}

export async function readBatchManifest(path: string): Promise<ManifestEntry[]> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new BatchInputError('Cannot read manifest. Use a readable JSON file.')
  }
  const parsed = z.object({assets: z.array(z.unknown()), version: z.literal(1)}).safeParse(value)
  if (!parsed.success)
    throw new BatchInputError('Invalid manifest. Use version 1 and an assets array.')
  const keys = new Set<string>()
  return parsed.data.assets.map((item) => {
    const key = z.object({key: z.string().min(1)}).safeParse(item)
    if (!key.success || keys.has(key.data.key)) {
      throw new BatchInputError('Invalid manifest. Give each entry a unique, non-empty key.')
    }
    keys.add(key.data.key)
    return {key: key.data.key, value: item}
  })
}

export function getBatchLocalPath(entry: ManifestEntry, manifestPath: string): string | undefined {
  const source = z.object({source: z.string()}).safeParse(entry.value)
  if (!source.success) return
  return resolve(dirname(manifestPath), source.data.source)
}

export async function prepareBatchEntry(entry: ManifestEntry, manifestPath: string) {
  const parsed = entrySchema.safeParse(entry.value)
  if (!parsed.success) throw new Error('Check the source, type, filename, and contentType fields.')
  const data = parsed.data
  const filePath = resolve(dirname(manifestPath), data.source)
  const filename = data.filename ?? basename(filePath)
  const hash = createHash('sha256').update(JSON.stringify({...data, source: filePath}))
  if (!(await stat(filePath)).isFile()) throw new Error('Source must be a readable file.')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return {...data, filename, filePath, fingerprint: hash.digest('hex')}
}
