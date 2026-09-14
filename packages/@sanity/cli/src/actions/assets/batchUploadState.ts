import {randomUUID} from 'node:crypto'
import {readFile, rename, rm, writeFile} from 'node:fs/promises'

import {z} from 'zod'

const successSchema = z.object({
  asset: z.object({_id: z.string(), url: z.string().optional()}),
  key: z.string(),
  reference: z.object({
    _type: z.enum(['image', 'file']),
    asset: z.object({_ref: z.string(), _type: z.literal('reference')}),
  }),
  status: z.literal('uploaded'),
})

export type BatchSuccess = z.infer<typeof successSchema>

const stateSchema = z.object({
  entries: z.array(
    z.object({
      dataset: z.string(),
      fingerprint: z.string(),
      projectId: z.string(),
      result: successSchema,
    }),
  ),
  version: z.literal(1),
})

export type BatchState = z.infer<typeof stateSchema>

export async function readBatchState(path: string): Promise<BatchState> {
  try {
    return stateSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {entries: [], version: 1}
    }
    throw new Error('Cannot read resume state. Check the file or choose a new --state path.', {
      cause: error,
    })
  }
}

export async function writeBatchState(path: string, state: BatchState): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(state), {flag: 'wx', mode: 0o600})
    await rename(temporary, path)
  } finally {
    await rm(temporary, {force: true})
  }
}
