import {extractManifest as internalExtractManifest} from '@sanity/cli-build/_internal/manifest'

type ExtractManifestOptions = Parameters<typeof internalExtractManifest>[0]

export async function extractManifest({
  applicationId,
  outPath,
  path,
  workDir,
}: ExtractManifestOptions): Promise<void> {
  await internalExtractManifest({applicationId, outPath, path, workDir})
}
