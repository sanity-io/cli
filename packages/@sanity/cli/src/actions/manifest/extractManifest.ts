import {extractManifest as interalExtractManifest} from '@sanity/cli-build/_internal/manifest'

type ExtractManifestOptions = Parameters<typeof interalExtractManifest>[0]

export async function extractManifest({
  outPath,
  path,
  workDir,
}: ExtractManifestOptions): Promise<void> {
  await interalExtractManifest({outPath, path, workDir})
}
