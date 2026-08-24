import {extractManifest as internalExtractManifest} from '@sanity/cli-build/_internal/manifest'

type ExtractManifestOptions = Parameters<typeof internalExtractManifest>[0]

export async function extractManifest({
  outPath,
  path,
  workDir,
}: ExtractManifestOptions): Promise<void> {
  await internalExtractManifest({outPath, path, workDir})
}
