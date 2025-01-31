import {z} from 'zod'

export const TYPE_DATASET = 'sanity.dataset' as const

export const datasetSchema = z.object({
  name: z.string(),
})

export type DatasetDefinition = z.infer<typeof datasetSchema>

export interface DatasetBlueprint {
  _type: typeof TYPE_DATASET
  name: string
}

export function defineDataset(def: DatasetDefinition): DatasetBlueprint {
  const {data, error} = datasetSchema.safeParse(def)
  if (error) {
    throw new Error(`Invalid dataset definition: ${error.message}`)
  }

  return {...data, _type: TYPE_DATASET}
}
