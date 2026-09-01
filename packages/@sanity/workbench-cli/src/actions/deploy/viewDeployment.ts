import {z} from 'zod/mini'

const viewDeclarationSchema = z.looseObject({
  name: z.string().check(z.regex(/^[a-zA-Z0-9_-]+$/, 'View `name` must match /^[a-zA-Z0-9_-]+$/')),
  src: z.string(),
  surface: z.enum(['window', 'panel', 'asset_source', 'tile']),
})

/** A view record as persisted to the application service. */
const viewRecordSchema = z.looseObject({
  name: z.string().check(z.regex(/^[a-zA-Z0-9_-]+$/, 'View `name` must match /^[a-zA-Z0-9_-]+$/')),
  src: z.string(),
  type: z.enum(['window', 'panel', 'asset_source', 'tile']),
})

/**
 * Payload registering an app's views with the application service on deploy.
 *
 * Phase 1 stub: the service that stores views does not exist yet, so the
 * payload is validated and logged only — never sent. Builds the contract the
 * application-service endpoint will accept.
 */
const viewDeploymentPayloadSchema = z.object({
  applicationId: z.string(),
  views: z.array(viewRecordSchema),
})

export type ViewDeploymentPayload = z.infer<typeof viewDeploymentPayloadSchema>

/**
 * Validates an app's declared views into the application-service payload.
 * Throws (via Zod) when a view declaration is malformed.
 */
export function buildViewDeploymentPayload(input: {
  applicationId: string
  views?: ReadonlyArray<Record<string, unknown>>
}): ViewDeploymentPayload {
  const views = z.array(viewDeclarationSchema).parse(input.views ?? [])
  return viewDeploymentPayloadSchema.parse({
    applicationId: input.applicationId,
    views: views.map(({surface, ...view}) => ({...view, type: surface})),
  })
}
