import {z} from 'zod'

/**
 * A view record as persisted to the application service: `type`, `name`, `src`,
 * plus any view-type-specific attributes (passed through for storage).
 */
const viewRecordSchema = z
  .object({
    name: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'View `name` must match /^[a-zA-Z0-9_-]+$/'),
    src: z.string(),
    type: z.enum(['panel']),
  })
  .passthrough()

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

type ViewDeploymentPayload = z.infer<typeof viewDeploymentPayloadSchema>

/**
 * Validate an app's declared views into the application-service payload.
 * Throws (via Zod) when a view declaration is malformed.
 */
export function buildViewDeploymentPayload(input: {
  applicationId: string
  views?: ReadonlyArray<Record<string, unknown>>
}): ViewDeploymentPayload {
  return viewDeploymentPayloadSchema.parse({
    applicationId: input.applicationId,
    views: input.views ?? [],
  })
}
