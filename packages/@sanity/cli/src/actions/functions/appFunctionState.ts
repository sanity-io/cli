import {randomUUID} from 'node:crypto'
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'

import {z} from 'zod'

const stateSchema = z.object({
  appId: z.string().min(1),
  appKind: z.enum(['coreApp', 'workbench']),
  environment: z.enum(['production', 'staging']),
  organizationId: z.string().min(1),
  stackId: z.string().min(1).optional(),
  version: z.literal(1),
})

export type AppFunctionState = z.infer<typeof stateSchema>

export async function readAppFunctionState(workDir: string): Promise<AppFunctionState | null> {
  const file = path.join(workDir, '.sanity', 'app-functions.json')
  let contents: string
  try {
    contents = await readFile(file, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
  try {
    return stateSchema.parse(JSON.parse(contents))
  } catch (error) {
    throw new Error(
      `Cannot read ${file}. Fix or remove this generated file, then run the command again.`,
      {cause: error},
    )
  }
}

export async function writeAppFunctionState(
  workDir: string,
  state: AppFunctionState,
): Promise<void> {
  const directory = path.join(workDir, '.sanity')
  const file = path.join(directory, 'app-functions.json')
  const temporary = `${file}.${randomUUID()}.tmp`
  await mkdir(directory, {recursive: true})
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`)
    await rename(temporary, file)
  } finally {
    await rm(temporary, {force: true})
  }
}
