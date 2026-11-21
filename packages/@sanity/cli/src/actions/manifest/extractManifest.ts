import {type extractManifest as internalExtractManifest} from '@sanity/cli-build/_internal/manifest'

import {loadCliBuild} from '../../util/loadCliBuild.js'

type ExtractManifestOptions = Parameters<typeof internalExtractManifest>[0]

export async function extractManifest({
  applicationId,
  outPath,
  path,
  silent,
  workDir,
}: ExtractManifestOptions): Promise<void> {
  const {extractManifest: internalExtractManifest} = await loadCliBuild('manifest')
  await internalExtractManifest({applicationId, outPath, path, silent, workDir})
}
