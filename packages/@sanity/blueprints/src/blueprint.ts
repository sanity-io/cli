import {z} from 'zod'

export const TYPE_BLUEPRINT = 'sanity.blueprint' as const

export const blueprintSchema = z.object({
  resources: z.array(z.object({}).passthrough()),
})

export type BlueprintDefinition = z.infer<typeof blueprintSchema>

export interface RootBlueprint {
  _type: typeof TYPE_BLUEPRINT
  resources: Array<Record<string, unknown>>
}

export function defineBlueprint(def: BlueprintDefinition): RootBlueprint {
  const {data, error} = blueprintSchema.safeParse(def)
  if (error) {
    throw new Error(`Invalid blueprint definition: ${error.message}`)
  }

  return {...data, _type: TYPE_BLUEPRINT}
}
