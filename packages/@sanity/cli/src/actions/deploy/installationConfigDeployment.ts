import {z} from 'zod/mini'

const mediaLibraryFieldSchema = z.looseObject({
  name: z.string().check(z.regex(/^[a-zA-Z0-9_-]+$/, 'Field `name` must match /^[a-zA-Z0-9_-]+$/')),
  public: z.optional(z.boolean()),
  src: z.string(),
  title: z.string(),
})

const mediaLibraryInstallationConfigSchema = z.looseObject({
  appType: z.literal('media-library'),
  fields: z.array(mediaLibraryFieldSchema),
})

// Discriminated on `appType` — the media-library config is the only shape the
// deploy accepts today; other app families add their own members.
const installationConfigRecordSchema = z.discriminatedUnion('appType', [
  mediaLibraryInstallationConfigSchema,
])

// Phase 1 stub: the endpoint isn't wired yet, so the payload is validated and
// logged only — never sent. Builds the contract the endpoint will accept.
const installationConfigDeploymentPayloadSchema = z.object({
  applicationId: z.string(),
  installationConfig: installationConfigRecordSchema,
})

type InstallationConfigDeploymentPayload = z.infer<typeof installationConfigDeploymentPayloadSchema>

/** Throws (via Zod) when the config is malformed or its `appType` is unknown. */
export function buildInstallationConfigDeploymentPayload(input: {
  applicationId: string
  installationConfig: Record<string, unknown> & {appType: string}
}): InstallationConfigDeploymentPayload {
  return installationConfigDeploymentPayloadSchema.parse({
    applicationId: input.applicationId,
    installationConfig: input.installationConfig,
  })
}
